// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: graduation-cap;
//
// ============================================================================
//  Moodle STRI  ->  app Fichiers
//  Télécharge le contenu d'un ou plusieurs cours Moodle (documents, vidéos,
//  images, pages, liens externes) et le range dans Fichiers, section par
//  section, en évitant de re-télécharger ce qui est déjà présent.
//
//  Site par défaut : https://www.stri.fr/eformation   (cours id=45)
//
//  AUTHENTIFICATION — connexion dans le navigateur, uniquement.
//  Tu te connectes dans la fenêtre qui s'ouvre (SSO / CAS compris), puis le
//  script travaille avec cette session. Le cours téléchargé est CELUI OUVERT
//  dans la fenêtre au moment où tu la fermes : navigue jusqu'au cours voulu,
//  puis ferme. Si Moodle expose un jeton de service
//  web sur la page « Clés de sécurité », il est mémorisé et réutilisé aux
//  lancements suivants : même authentification, sans avoir à se reconnecter.
//
//  RANGEMENT — deux façons, au choix (CONFIG.layout / CONFIG.askLayout)
//    "sections"   : un dossier par section du cours, comme sur Moodle.
//    "categories" : un dossier par type — Documents, Présentations, Tableurs,
//                   Code, Pages, Images, Vidéos, Audio, Archives, Liens, Autres.
//  Dans les deux cas, INDEX.md et INDEX.html suivent le plan du cours et
//  pointent vers les fichiers là où ils ont été rangés.
//
//  STOCKAGE — à lire une fois
//  FileManager.local().documentsDirectory() est un conteneur INTERNE que l'app
//  Fichiers n'affiche pas. Ce que Fichiers montre sous « Scriptable », c'est le
//  File Provider. On écrit donc dans le signet « File Provider Storage »
//  (Scriptable ▸ ⚙️ ▸ File Bookmarks), présent par défaut.
//  Pour choisir un autre dossier : ⚙️ ▸ File Bookmarks ▸ + ▸ Pick Folder,
//  puis reportez son nom dans CONFIG.bookmarkName.
// ============================================================================

const CONFIG = {
  // --- Site et cours -------------------------------------------------------
  baseUrl: "https://www.stri.fr/eformation",
  followBrowserCourse: true, // le cours ouvert dans le navigateur au moment de la fermeture
  courseIds: [45],          // repli si aucun cours n'est détecté ; ex. [45, 52, 61]
  courseNames: {            // nom impose par cours : prioritaire sur la detection
    45: "Bases de données - Oracle",
  },
  allMyCourses: false,      // true = tous les cours où je suis inscrit (mode ws)

  // --- Stockage ------------------------------------------------------------
  rootFolderName: "Moodle STRI",
  layout: "sections",       // "sections" = un dossier par section ; "categories" = Documents/, Vidéos/, Images/…
  askLayout: true,          // true = demander le rangement à chaque lancement
  includeCourseId: false,         // true = « 45 - Bases de données » ; false = « Bases de données »
  bookmarkName: "File Provider Storage", // signet Scriptable ; "" = conteneur interne (invisible dans Fichiers)
  useICloud: false,               // false = local ; true = iCloud Drive
  overwrite: false,               // true = re-télécharge tout à chaque fois
  maxFileMB: 0,                   // 0 = pas de limite ; ex. 300 pour éviter les gros films
  maxFileMBWebView: 60,           // limite spécifique au mode WebView (pont JS)

  // --- Contenus ------------------------------------------------------------
  downloadFiles: true,      // documents, vidéos, images…
  savePages: true,          // "Pages" Moodle enregistrées en .html
  saveLinks: true,          // liens externes -> fichiers .url + LIENS.md
  linkFileFormat: "url",    // "url" | "html" | "webloc"
  saveIndex: true,          // INDEX.md : copie Markdown de la page du cours
  saveIndexHtml: true,      // INDEX.html : même contenu, liens cliquables sur iOS
  saveImagesToPhotos: false,// true = copie aussi les images dans Photos

  // --- Divers --------------------------------------------------------------
  notify: true,             // notification iOS à la fin
  verbose: true,
  reuseToken: true,         // true = réutilise le jeton mémorisé sans rouvrir le navigateur
  resetAuth: false,         // true = oublie le jeton mémorisé et force une nouvelle connexion
};

// ---------------------------------------------------------------------------
//  Constantes internes
// ---------------------------------------------------------------------------
const BASE = String(CONFIG.baseUrl).replace(/\/+$/, "");
const ORIGIN = (BASE.match(/^https?:\/\/[^/]+/) || [BASE])[0];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const KC = { token: "moodle_stri_token" };

// Clés écrites par les versions précédentes : purgées au démarrage pour ne pas
// laisser traîner un mot de passe dans le trousseau.
const KC_LEGACY = ["moodle_stri_user", "moodle_stri_pass"];

const stats = { files: 0, skipped: 0, moved: 0, links: 0, pages: 0, bytes: 0, errors: [] };

// ---------------------------------------------------------------------------
//  Petits utilitaires
// ---------------------------------------------------------------------------
function log(m) { if (CONFIG.verbose) console.log(m); }
function warn(m) { console.warn(m); }
function fail(m) { console.error(String(m)); stats.errors.push(String(m)); }

function sleep(ms) { return new Promise((r) => Timer.schedule(ms, false, r)); }

function pad2(n) { return String(n).padStart(2, "0"); }

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "?";
  const u = ["o", "Ko", "Mo", "Go"];
  let i = 0, v = Number(bytes);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeEntities(
    String(html == null ? "" : html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

/** Nettoie un nom pour qu'il soit utilisable comme nom de fichier/dossier. */
function sanitize(name, fallback) {
  let s = stripTags(name)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (!s) s = fallback || "sans-nom";
  if (s.length > 120) {
    const dot = s.lastIndexOf(".");
    const ext = dot > s.length - 12 && dot > 0 ? s.slice(dot) : "";
    s = s.slice(0, 120 - ext.length).trim() + ext;
  }
  return s;
}

function qs(obj) {
  return Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
    .join("&");
}

function withParams(url, params) {
  const s = qs(params);
  if (!s) return url;
  return url + (url.indexOf("?") >= 0 ? "&" : "?") + s;
}

/** Transforme {a:{b:1}} ou {a:[{n:1}]} en {"a[b]":1} pour l'API REST Moodle. */
function flatten(obj, prefix, out) {
  out = out || {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function absolutize(url, base) {
  let u = decodeEntities(String(url || "")).trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return ORIGIN + u;
  const b = String(base || BASE).replace(/[^/]*$/, "");
  return b + u;
}

function isSameSite(url) {
  return String(url || "").indexOf(ORIGIN) === 0;
}

async function retry(label, fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (i < tries - 1) {
        warn(`   ↻ ${label} : nouvel essai (${i + 1}) — ${e}`);
        await sleep(1500 * Math.pow(2, i));
      }
    }
  }
  throw last;
}

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { return fallback; }
}

// ---------------------------------------------------------------------------
//  Système de fichiers + manifeste (pour ne pas re-télécharger)
// ---------------------------------------------------------------------------
const fm = (() => {
  if (CONFIG.useICloud) {
    try {
      const f = FileManager.iCloud();
      f.documentsDirectory();
      return f;
    } catch (e) {
      warn("iCloud Drive indisponible — stockage local utilisé.");
    }
  }
  return FileManager.local();
})();

/**
 * Dossier racine.
 *
 * documentsDirectory() est un conteneur interne que l'app Fichiers n'affiche
 * pas. On privilégie donc un signet (⚙️ ▸ File Bookmarks), en particulier
 * « File Provider Storage » : c'est exactement ce que Fichiers montre sous
 * Scriptable. Si le signet est absent, on retombe sur l'ancien comportement.
 */
const ROOT = (() => {
  const name = String(CONFIG.bookmarkName || "").trim();
  if (name) {
    try {
      const base = fm.bookmarkedPath(name);
      if (base) return fm.joinPath(base, CONFIG.rootFolderName);
    } catch (e) {
      warn(
        `Signet « ${name} » introuvable (Scriptable ▸ ⚙️ ▸ File Bookmarks) — ` +
        "écriture dans le conteneur interne, invisible depuis Fichiers."
      );
    }
  }
  return fm.joinPath(fm.documentsDirectory(), CONFIG.rootFolderName);
})();

/** Ouvre un chemin dans l'app Fichiers. encodeURI : le chemin contient des espaces. */
function openInFiles(path) {
  Safari.open("shareddocuments://" + encodeURI(path));
}

function ensureDir(path) {
  if (!fm.fileExists(path)) fm.createDirectory(path, true);
  return path;
}

let manifest = {};
const manifestPath = () => fm.joinPath(ROOT, "_manifest.json");

async function loadManifest() {
  ensureDir(ROOT);
  const p = manifestPath();
  if (!fm.fileExists(p)) return;
  try {
    if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) {
      await fm.downloadFileFromiCloud(p);
    }
    manifest = JSON.parse(fm.readString(p)) || {};
  } catch (e) {
    warn("Manifeste illisible, il sera reconstruit.");
    manifest = {};
  }
}

function saveManifest() {
  try { fm.writeString(manifestPath(), JSON.stringify(manifest, null, 1)); }
  catch (e) { fail("Écriture du manifeste : " + e); }
}

/**
 * Le fichier est déjà là, mais ailleurs (rangement changé, dossier renommé) :
 * on le déplace plutôt que de le retélécharger.
 */
function relocate(key, target, dir) {
  const known = manifest[key];
  if (!known || !known.path || known.path === target) return false;
  if (!fm.fileExists(known.path)) return false;
  try {
    ensureDir(dir);
    fm.move(known.path, target);
    manifest[key] = { path: target, size: known.size || 0, time: known.time || 0 };
    stats.moved++;
    return true;
  } catch (e) {
    warn(`Déplacement impossible : ${e}`);
    return false;
  }
}

/** À quelle ressource appartient ce chemin, d'après le manifeste ? */
function pathOwner(path) {
  for (const k of Object.keys(manifest)) {
    if (k === "__courses") continue;
    const e = manifest[k];
    if (e && e.path === path) return k;
  }
  return null;
}

/**
 * Chemin de destination pour `key`, avec " (2)", " (3)"… seulement si le nom
 * est déjà pris par une AUTRE ressource.
 *
 * L'ancienne version comparait au chemin mémorisé : après un renommage de
 * dossier, tout le manifeste devenait obsolète et un doublon était créé à
 * chaque exécution. Elle calculait de surcroît l'extension sur le nom déjà
 * suffixé tout en découpant le nom d'origine, d'où « Séquence 0.pdf (3) ».
 */
function uniquePath(dir, filename, key, altName) {
  const name = sanitize(filename, "fichier");
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  const free = (path) => {
    if (!fm.fileExists(path)) return true;
    const owner = pathOwner(path);
    return !owner || owner === key; // libre, ou déjà à nous
  };

  let path = fm.joinPath(dir, name);
  if (free(path)) return path;

  // Deux activités qui livrent le même nom de fichier : l'intitulé de
  // l'activité est plus parlant qu'un « (2) ». Indispensable en rangement par
  // catégories, où tout le cours se retrouve dans un même dossier.
  const alt = sanitize(String(altName || ""), "");
  if (alt) {
    const full = /\.[a-z0-9]{1,8}$/i.test(alt) ? alt : alt + ext;
    path = fm.joinPath(dir, full);
    if (free(path)) return path;
  }

  for (let n = 2; n <= 50; n++) {
    path = fm.joinPath(dir, `${stem} (${n})${ext}`);
    if (free(path)) return path;
  }
  return path;
}

// ---------------------------------------------------------------------------
//  Couche HTTP (mode ws / web) — gestion manuelle des cookies de session
// ---------------------------------------------------------------------------
const jar = {
  store: {},
  header() {
    const keys = Object.keys(this.store);
    return keys.length ? keys.map((k) => `${k}=${this.store[k]}`).join("; ") : null;
  },
  absorb(response) {
    if (!response || !response.cookies) return;
    for (const c of response.cookies) if (c && c.name) this.store[c.name] = c.value;
  },
};

function lowerHeaders(h) {
  const out = {};
  for (const k of Object.keys(h || {})) out[String(k).toLowerCase()] = h[k];
  return out;
}

/**
 * Requête HTTP.
 * opts: {method, form, body, headers, as:"data"|"string"|"json", followRedirects, timeout}
 */
async function http(url, opts) {
  const o = opts || {};
  const req = new Request(url);
  req.method = o.method || (o.form ? "POST" : "GET");
  req.timeoutInterval = o.timeout || 120;

  const headers = Object.assign(
    {
      "User-Agent": UA,
      Accept: o.accept || "*/*",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    o.headers || {}
  );
  const cookie = jar.header();
  if (cookie) headers["Cookie"] = cookie;
  if (o.form) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  req.headers = headers;
  if (o.form) req.body = qs(o.form);
  else if (o.body !== undefined) req.body = o.body;

  const redirects = [];
  req.onRedirect = (newRequest) => {
    redirects.push(newRequest.url);
    return o.followRedirects === false ? null : newRequest;
  };

  let payload = null;
  let error = null;
  try {
    if (o.as === "json") payload = await req.loadJSON();
    else if (o.as === "string") payload = await req.loadString();
    else payload = await req.load();
  } catch (e) {
    error = e;
  }
  jar.absorb(req.response);
  const resp = req.response || {};
  if (error && !(o.followRedirects === false && resp.statusCode)) throw error;

  const h = lowerHeaders(resp.headers);
  return {
    payload,
    status: resp.statusCode || 0,
    headers: h,
    location: h["location"] || (redirects.length ? redirects[redirects.length - 1] : ""),
    finalUrl: redirects.length ? redirects[redirects.length - 1] : url,
    redirects,
  };
}

/** Client "réseau" : utilisé en mode ws et en mode web (session par cookie). */
const NetClient = {
  mode: "net",

  async fetch(url) {
    const r = await retry(url, () => http(url, { as: "data" }));
    const ct = String(r.headers["content-type"] || "");
    const textish = /^(text\/|application\/(json|javascript|xhtml))/i.test(ct);
    let text = null;
    if (textish && r.payload) {
      try { text = r.payload.toRawString(); } catch (e) { text = null; }
    }
    return {
      status: r.status,
      contentType: ct,
      disposition: String(r.headers["content-disposition"] || ""),
      finalUrl: r.finalUrl,
      data: textish ? null : r.payload,
      text,
      size: Number(r.headers["content-length"] || 0) || null,
    };
  },

  /** Taille annoncée par le serveur, sans télécharger (0 si inconnue). */
  async size(url) {
    const r = await safe(() => http(url, { method: "HEAD", as: "data" }), null);
    return r ? Number(r.headers["content-length"] || 0) : 0;
  },

  /** Cible d'une redirection sans la suivre (utile pour mod/url). */
  async redirectTarget(url) {
    const r = await safe(() => http(url, { as: "data", followRedirects: false }), null);
    if (!r) return "";
    if (r.status >= 300 && r.status < 400) return absolutize(r.location, url);
    return "";
  },
};

/** Client "WebView" : la session SSO/CAS vit dans la WebView, on l'utilise via fetch(). */
const WebViewClient = {
  mode: "wv",
  wv: null,

  async ensure(wv) { this.wv = wv; },

  async run(url, wantBinary) {
    const cap = Math.max(1, CONFIG.maxFileMBWebView) * 1024 * 1024;
    const js = `
      (function () {
        var TARGET = ${JSON.stringify(url)};
        var CAP = ${cap};
        var WANT_BINARY = ${wantBinary ? "true" : "false"};

        var done = false;
        function reply(payload) {
          if (done) return;
          done = true;
          completion(payload);
        }

        // Filet de sécurité : jamais de blocage silencieux.
        setTimeout(function () {
          reply({ ok: false, status: 0, error: "timeout" });
        }, 120000);

        (async function () {
          try {
            const r = await fetch(TARGET, { credentials: "include", redirect: "follow" });
            const ct = r.headers.get("content-type") || "";
            const cd = r.headers.get("content-disposition") || "";
            const textish = /^(text\\/|application\\/(json|javascript|xhtml))/i.test(ct);

            if (textish || !WANT_BINARY) {
              const t = await r.text();
              reply({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, text: t });
              return;
            }

            const b = await r.blob();
            if (b.size > CAP) {
              reply({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, size: b.size, tooLarge: true });
              return;
            }

            const b64 = await new Promise(function (res, rej) {
              const fr = new FileReader();
              fr.onload = function () { res(String(fr.result).split(",")[1] || ""); };
              fr.onerror = function () { rej(fr.error); };
              fr.readAsDataURL(b);
            });

            reply({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, size: b.size, b64: b64 });
          } catch (e) {
            reply({ ok: false, status: 0, error: String(e && e.message ? e.message : e) });
          }
        })();

        // IMPORTANT : la fonction englobante ne retourne rien.
        // WKWebView reçoit donc undefined, et non une Promise (type non supporté).
      })();
    `;
    return await this.wv.evaluateJavaScript(js, true);
  },

  async fetch(url) {
    const r = (await retry(url, () => this.run(url, true))) || {};
    if (r.error) throw new Error(r.error);
    let data = null;
    if (r.b64) {
      try { data = Data.fromBase64String(r.b64); } catch (e) { data = null; }
    }
    return {
      status: r.status || 0,
      contentType: String(r.contentType || ""),
      disposition: String(r.disposition || ""),
      finalUrl: r.url || url,
      data,
      text: r.text != null ? r.text : null,
      size: r.size || null,
      tooLarge: !!r.tooLarge,
    };
  },

  async size() { return 0; },

  /** En WebView on demande à Moodle de ne pas rediriger (paramètre redirect=0). */
  async redirectTarget() { return ""; },
};

// ---------------------------------------------------------------------------
//  Enregistrement : fichiers, liens, pages
// ---------------------------------------------------------------------------
function filenameFromUrl(url, fallback) {
  try {
    const clean = String(url).split("#")[0].split("?")[0];
    const last = clean.split("/").filter(Boolean).pop() || "";
    const name = decodeURIComponent(last);
    if (name && /\.[a-z0-9]{1,8}$/i.test(name)) return name;
    if (name) return name;
  } catch (e) { /* ignore */ }
  return fallback || "fichier";
}

function filenameFromDisposition(disposition) {
  if (!disposition) return "";
  let m = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (m) { try { return decodeURIComponent(m[1].trim()); } catch (e) { /* ignore */ } }
  m = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return m ? m[1].trim() : "";
}

const IMAGE_EXT = /\.(jpe?g|png|gif|heic|heif|webp|tiff?)$/i;

// ---------------------------------------------------------------------------
//  Rangement par catégories
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { name: "Documents",     ext: /\.(pdf|docx?|odt|rtf|txt|md|tex|pages)$/i },
  { name: "Présentations", ext: /\.(pptx?|odp|key)$/i },
  { name: "Tableurs",      ext: /\.(xlsx?|ods|csv|tsv|numbers)$/i },
  { name: "Code",          ext: /\.(sql|py|js|ts|java|c|cpp|h|hpp|sh|json|xml|ya?ml|ipynb|php|rb|go|rs|cs|pls?)$/i },
  { name: "Pages",         ext: /\.(html?|mhtml)$/i },
  { name: "Images",        ext: /\.(jpe?g|png|gif|heic|heif|webp|svg|bmp|tiff?)$/i },
  { name: "Vidéos",        ext: /\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv|mpe?g)$/i },
  { name: "Audio",         ext: /\.(mp3|m4a|wav|aac|ogg|flac|aiff?)$/i },
  { name: "Archives",      ext: /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i },
];

/** Catégorie d'un fichier, d'après son extension puis le type d'activité. */
function categoryFor(filename, modname) {
  const n = String(filename || "");
  if (/\.(url|webloc)$/i.test(n) || modname === "url") return "Liens";
  for (const c of CATEGORIES) if (c.ext.test(n)) return c.name;
  if (modname === "page" || modname === "book") return "Pages";
  return "Autres";
}

function byCategories() {
  return CONFIG.layout === "categories";
}

/**
 * Où écrire un fichier.
 * ctx : { courseDir, secDir, modName, modId, modname, filename, multi, filepath }
 */
function fileDestDir(ctx) {
  if (byCategories()) {
    return fm.joinPath(ctx.courseDir, categoryFor(ctx.filename, ctx.modname));
  }
  let dir = ctx.secDir;
  if (ctx.multi) dir = fm.joinPath(dir, sanitize(ctx.modName, `module-${ctx.modId}`));
  const sub = String(ctx.filepath || "/").replace(/^\/+|\/+$/g, "");
  if (sub) dir = fm.joinPath(dir, sanitize(sub.replace(/\//g, " - "), ""));
  return dir;
}

/** Où écrire un raccourci .url ou une page enregistrée. */
function sideDestDir(courseDir, secDir, category, sub) {
  if (byCategories()) return fm.joinPath(courseDir, category);
  return sub ? fm.joinPath(secDir, sub) : secDir;
}

/** Extension déduite du type MIME, quand l'URL n'en donne aucune. */
function extForContentType(ct) {
  const c = String(ct || "").toLowerCase();
  if (c.indexOf("pdf") >= 0) return ".pdf";
  if (c.indexOf("zip") >= 0) return ".zip";
  if (c.indexOf("json") >= 0) return ".json";
  if (c.indexOf("csv") >= 0) return ".csv";
  if (c.indexOf("sql") >= 0) return ".sql";
  if (c.indexOf("xml") >= 0) return ".xml";
  if (c.indexOf("plain") >= 0) return ".txt";
  return "";
}

/**
 * La réponse est-elle une page web, ou le fichier lui-même ?
 *
 * Un .sql ou un .txt arrive en text/plain : res.text est rempli sans que ce
 * soit une page. Sans ce test, le fichier n'était jamais enregistré et
 * INDEX.md gardait le lien Moodle.
 */
function looksLikeWebPage(res) {
  if (res.disposition && /attachment|filename/i.test(res.disposition)) return false;
  if (/text\/html|application\/xhtml/i.test(String(res.contentType || ""))) return true;
  if (res.text == null) return false;
  return /<!doctype html|<html[\s>]/i.test(String(res.text).slice(0, 2000));
}

/**
 * Télécharge une URL vers `dir/filename`, en sautant ce qui est déjà à jour.
 * meta = { key, size, time }
 */
async function saveFile(client, dir, filename, url, meta) {
  if (!CONFIG.downloadFiles) return null;
  const key = meta.key;
  const known = manifest[key];
  const name = sanitize(filename, "fichier");
  const target = uniquePath(ensureDir(dir), name, key, meta.label);

  if (!CONFIG.overwrite && fm.fileExists(target)) {
    const sameSize = !meta.size || !known || known.size === meta.size;
    const sameTime = !meta.time || !known || known.time === meta.time;
    if (sameSize && sameTime) {
      stats.skipped++;
      log(`      = ${name}`);
      manifest[key] = { path: target, size: meta.size || (known && known.size) || 0, time: meta.time || 0 };
      return target;
    }
  }

  if (!CONFIG.overwrite) {
    const sameSize = !meta.size || !known || known.size === meta.size;
    const sameTime = !meta.time || !known || known.time === meta.time;
    if (sameSize && sameTime && relocate(key, target, dir)) {
      log(`      ↦ ${name}`);
      return target;
    }
  }

  if (CONFIG.maxFileMB > 0) {
    let size = meta.size || 0;
    if (!size && client.size) size = await client.size(url);
    if (size && size > CONFIG.maxFileMB * 1024 * 1024) {
      stats.skipped++;
      log(`      ⏭︎ ${name} — ${humanSize(size)} > limite ${CONFIG.maxFileMB} Mo`);
      return null;
    }
  }

  const res = await client.fetch(url);
  if (res.tooLarge) {
    stats.skipped++;
    log(`      ⏭︎ ${name} — ${humanSize(res.size)} (limite WebView ${CONFIG.maxFileMBWebView} Mo)`);
    return null;
  }
  if (res.status && (res.status < 200 || res.status >= 300)) {
    fail(`HTTP ${res.status} pour ${name}`);
    return null;
  }

  let data = res.data;
  if (!data && res.text != null) {
    // Le serveur a renvoyé du texte : soit c'est vraiment un fichier texte/HTML,
    // soit on est retombé sur la page de connexion.
    if (/<html/i.test(res.text) && /id="page-login-index"|\bnotloggedin\b/i.test(res.text)) {
      fail(`Session expirée en téléchargeant « ${name} »`);
      return null;
    }
    data = Data.fromString(res.text);
  }
  if (!data) { fail(`Réponse vide pour ${name}`); return null; }

  // Nom plus précis fourni par le serveur ?
  const fromHeader = sanitize(filenameFromDisposition(res.disposition), "");
  let finalPath = target;
  if (fromHeader && fromHeader !== name && !/\.[a-z0-9]{1,8}$/i.test(name)) {
    finalPath = uniquePath(dir, fromHeader, key, meta.label);
  }

  fm.write(finalPath, data);
  const written = Math.round((fm.fileSize(finalPath) || 0) * 1024);
  manifest[key] = { path: finalPath, size: meta.size || res.size || written, time: meta.time || 0 };
  stats.files++;
  stats.bytes += meta.size || res.size || written;
  log(`      ↓ ${fm.fileName(finalPath, true)} (${humanSize(meta.size || res.size || written)})`);

  if (CONFIG.saveImagesToPhotos && IMAGE_EXT.test(finalPath)) {
    await safe(async () => { Photos.save(Image.fromData(data)); });
  }
  return finalPath;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Écrit un raccourci vers un lien externe + alimente la liste LIENS.md. */
function writeLink(dir, name, url, collector) {
  if (!CONFIG.saveLinks || !url) return;
  const label = sanitize(name, "lien");
  let content, ext;
  if (CONFIG.linkFileFormat === "webloc") {
    ext = ".webloc";
    content =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>' +
      escapeXml(url) + "</string>\n</dict>\n</plist>\n";
  } else if (CONFIG.linkFileFormat === "html") {
    ext = ".html";
    content =
      `<!doctype html><meta charset="utf-8"><title>${escapeXml(label)}</title>` +
      `<meta http-equiv="refresh" content="0; url=${escapeXml(url)}">` +
      `<p><a href="${escapeXml(url)}">${escapeXml(label)}</a></p>`;
  } else {
    ext = ".url";
    content = `[InternetShortcut]\r\nURL=${url}\r\n`;
  }
  try {
    fm.writeString(fm.joinPath(ensureDir(dir), label + ext), content);
    stats.links++;
    if (collector) collector.push({ name: label, url });
  } catch (e) {
    fail(`Lien « ${label} » : ${e}`);
  }
}

/** Enregistre une page Moodle (contenu principal) en HTML autonome. */
function savePage(dir, name, html, sourceUrl) {
  if (!CONFIG.savePages) return null;
  const label = sanitize(name, "page");
  const body = extractMainContent(html);
  const doc =
    `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeXml(label)}</title>\n` +
    `<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;margin:1.2em;max-width:44em}` +
    `img,video,iframe{max-width:100%;height:auto}pre{overflow:auto}</style>\n</head>\n<body>\n` +
    `<h1>${escapeXml(label)}</h1>\n${body}\n` +
    `<hr><p style="color:#777;font-size:.85em">Source : <a href="${escapeXml(sourceUrl || "")}">` +
    `${escapeXml(sourceUrl || "")}</a></p>\n</body>\n</html>\n`;
  try {
    const path = fm.joinPath(ensureDir(dir), label + ".html");
    fm.writeString(path, doc);
    stats.pages++;
    log(`      ✎ ${label}.html`);
    return path;
  } catch (e) {
    fail(`Page « ${label} » : ${e}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Authentification
// ---------------------------------------------------------------------------
async function wsCall(token, wsfunction, params) {
  const form = Object.assign(
    { wstoken: token, wsfunction, moodlewsrestformat: "json" },
    flatten(params || {})
  );
  const r = await retry(wsfunction, () =>
    http(`${BASE}/webservice/rest/server.php`, { form, as: "json" })
  );
  const j = r.payload;
  if (j && j.exception) throw new Error(`${wsfunction} : ${j.message || j.errorcode}`);
  return j;
}

async function validateToken(token) {
  if (!token) return null;
  const info = await safe(() => wsCall(token, "core_webservice_get_site_info", {}), null);
  return info && info.username ? info : null;
}

/**
 * Sommes-nous authentifiés sur cette page ?
 *
 * ⚠️ Ne JAMAIS tester « sesskey » : Moodle écrit M.cfg = {"sesskey":"..."} sur
 * toutes ses pages, connexion comprise. Le test était donc toujours vrai, et
 * le script prenait la page de login pour une session ouverte.
 *
 * Marqueurs négatifs fiables : l'identifiant de page « page-login-index » et
 * la classe « notloggedin » que Moodle pose sur <body> pour les visiteurs.
 * Marqueur positif : le lien de déconnexion, rendu pour les seuls connectés.
 */
function isLoggedInHtml(html) {
  const src = String(html || "");
  if (/id="page-login-index"|\bnotloggedin\b/i.test(src)) return false;
  return /\/login\/logout\.php/i.test(src);
}

/** La page de connexion est-elle celle de Moodle, ou un portail SSO externe ? */
function looksLikeSso(finalUrl, html) {
  if (finalUrl && !isSameSite(finalUrl)) return true;
  return /name="execution"|\/cas\/login|shibboleth|SAMLRequest|\/idp\//i.test(String(html || ""));
}

/**
 * Quel cours est ouvert dans la WebView ?
 *
 * Lu au moment où l'utilisateur referme la fenêtre : c'est ainsi qu'il choisit
 * le cours à télécharger. L'URL suffit sur une page de cours ; ailleurs
 * (activité, devoir…) on se rabat sur M.cfg.courseId puis sur la classe
 * « course-<id> » que Moodle pose sur <body>.
 */
async function detectCourseInWebView(wv) {
  const js = `
    (function () {
      function reply(o) { completion(JSON.stringify(o)); }
      try {
        var href = String(location.href || "");
        var id = 0;

        var m = /\\/course\\/view\\.php\\?(?:[^#]*&)?id=(\\d+)/.exec(href);
        if (m) id = Number(m[1]);
        if (!id && window.M && M.cfg && M.cfg.courseId) id = Number(M.cfg.courseId);
        if (!id && document.body) {
          var b = /(?:^|\\s)course-(\\d+)(?:\\s|$)/.exec(document.body.className || "");
          if (b) id = Number(b[1]);
        }

        var name = "";
        var hdr = document.querySelector(".page-header-headings h1, #page-header h1");
        if (hdr) name = String(hdr.textContent || "");
        if (!name) name = String(document.title || "");

        // id 1 = page d'accueil du site, ce n'est pas un cours.
        reply({ id: id > 1 ? id : 0, name: name, url: href });
      } catch (e) {
        reply({ id: 0, name: "", url: "", error: String(e) });
      }
    })();
  `;
  const raw = await safe(() => wv.evaluateJavaScript(js, true), null);
  if (!raw) return null;
  let d = null;
  try { d = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!d || !d.id) return null;
  return { id: Number(d.id), name: cleanCourseTitle(d.name || "") };
}

/** Connexion dans une WebView : seule solution fiable avec un SSO/CAS. */
async function webViewLogin() {
  const wv = new WebView();
  await wv.loadURL(`${BASE}/login/index.php`);
  const notice = new Alert();
  notice.title = "Connexion dans le navigateur";
  notice.message =
    "Connecte-toi à Moodle dans la fenêtre qui s'ouvre (y compris SSO/CAS), " +
    "attends d'arriver sur ton tableau de bord, puis ferme la fenêtre (Terminé) " +
    "pour lancer le téléchargement.";
  notice.addAction("Continuer");
  await notice.presentAlert();
  await wv.present(true);

  // L'utilisateur a pu naviguer jusqu'au cours qui l'intéresse : on relève
  // lequel AVANT de quitter la page pour revenir sur /my/.
  const detected = await detectCourseInWebView(wv);
  if (detected) {
    log(`Cours ouvert à la fermeture : « ${detected.name || "sans nom"} » (id ${detected.id}).`);
  } else {
    warn("Aucun cours identifié dans le navigateur — repli sur CONFIG.courseIds.");
  }

  // On se replace sur le domaine Moodle : les fetch() suivants doivent être
  // « same-origin » (si la connexion se termine sur le portail SSO, CORS bloque).
  // loadURL rend la main avant la fin du rendu : on laisse la page se poser.
  await safe(() => wv.loadURL(`${BASE}/my/`), null);
  await sleep(1500);
  await WebViewClient.ensure(wv);
  const probe = await WebViewClient.run(`${BASE}/my/`, false);
  const html = String((probe && probe.text) || "");
  if (!isLoggedInHtml(html)) {
    const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    throw new Error(
      "Connexion non aboutie : la page reçue est « " +
      (stripTags(t ? t[1] : "") || "sans titre") +
      " ». Relance, connecte-toi jusqu'à voir ton tableau de bord, et seulement " +
      "ensuite ferme la fenêtre."
    );
  }
  return { wv, detected };
}

/** Tente de récupérer un jeton de service web depuis la page « Clés de sécurité ». */
async function tokenFromManageTokenPage(client) {
  const r = await safe(() => client.fetch(`${BASE}/user/managetoken.php`), null);
  const html = String((r && r.text) || "");
  if (!html) return null;
  const rows = html.split(/<tr[^>]*>/i);
  for (const row of rows) {
    if (!/moodle_mobile_app|Moodle mobile|service mobile/i.test(row)) continue;
    const m = /\b([a-f0-9]{32})\b/i.exec(stripTags(row));
    if (m) return m[1];
  }
  const any = /\b([a-f0-9]{32})\b/i.exec(stripTags(html));
  return any ? any[1] : null;
}

// ---------------------------------------------------------------------------
//  Analyse HTML (mode web / WebView)
// ---------------------------------------------------------------------------
function extractMainContent(html) {
  const src = String(html || "");
  let m = /<div[^>]+class="[^"]*\bno-overflow\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(src);
  if (m) return m[1];
  m = /<section[^>]+id="region-main"[^>]*>([\s\S]*?)<\/section>/i.exec(src);
  if (m) return m[1];
  m = /<div[^>]+role="main"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(src);
  if (m) return m[1];
  m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(src);
  return m ? m[1] : src;
}

function extractPluginfileUrls(html, baseUrl) {
  const out = [];
  const seen = {};
  const re = /(?:href|src|data)\s*=\s*["']([^"']*(?:pluginfile|draftfile)\.php\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const url = absolutize(m[1], baseUrl);
    if (!url || seen[url]) continue;
    seen[url] = true;
    out.push(url);
  }
  return out;
}

const EMBED_HOSTS = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|podeduc|pod\.|panopto|kaltura|canal-u|soundcloud|onedrive|sharepoint|drive\.google|framatube|peertube)/i;

function extractEmbeds(html, baseUrl) {
  const out = [];
  const seen = {};
  const re = /<(?:iframe|embed|source|video)[^>]+src\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const url = absolutize(m[1], baseUrl);
    if (!url || seen[url] || /pluginfile\.php|draftfile\.php/i.test(url)) continue;
    if (!EMBED_HOSTS.test(url) && isSameSite(url)) continue;
    seen[url] = true;
    out.push(url);
  }
  return out;
}

/**
 * Blocs d'activité d'une section, dans l'ordre de la page.
 *
 * Moodle enveloppe chaque activité dans un <li id="module-123" class="… modtype_x">.
 * Ce découpage donne aussi les « étiquettes » (modtype_label), qui portent les
 * paragraphes affichés directement sur la page du cours.
 */
function parseActivityBlocks(sectionHtml) {
  const src = String(sectionHtml || "");
  const marks = [];
  const re = /id="module-(\d+)"/gi;
  let m;
  while ((m = re.exec(src))) {
    // id="module-123" se trouve APRÈS l'attribut class dans la balise : on
    // remonte à l'ouverture du tag, sinon le bloc perd sa propre classe
    // modtype_ et hérite de celle de l'activité suivante.
    const open = src.lastIndexOf("<", m.index);
    marks.push({ id: m[1], at: open >= 0 ? open : m.index });
  }

  const items = [];
  const seen = {};

  if (marks.length) {
    for (let i = 0; i < marks.length; i++) {
      const id = marks[i].id;
      if (seen[id]) continue;
      seen[id] = true;

      const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
      const block = src.slice(marks[i].at, end);

      const a = /<a[^>]+href="([^"]*\/mod\/([a-z0-9_]+)\/view\.php\?id=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      const cls = /class="[^"]*modtype_([a-z0-9_]+)/i.exec(block);
      const modname = (cls && cls[1]) || (a ? a[2] : "label");

      let name = "";
      if (a) {
        let label = a[3].replace(/<span[^>]*class="[^"]*accesshide[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
        const inst = /class="[^"]*instancename[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(label);
        if (inst) label = inst[1];
        name = stripTags(label);
      }

      // Description affichée sous l'activité — pour une étiquette, c'est tout son contenu.
      let descHtml = "";
      const d =
        /<div[^>]+class="[^"]*\bcontentafterlink\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block) ||
        /<div[^>]+class="[^"]*\bactivity-altcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block) ||
        /<div[^>]+class="[^"]*\bno-overflow\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      if (d) descHtml = d[1];
      if (!descHtml && !a) descHtml = block;

      items.push({ id, modname, name, url: a ? absolutize(a[1], BASE) : "", descHtml });
    }
    return items;
  }

  // Thèmes anciens, sans id="module-…" : on retombe sur les liens d'activité.
  const aRe = /<a[^>]+href="([^"]*\/mod\/([a-z0-9_]+)\/view\.php\?id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let a;
  while ((a = aRe.exec(src))) {
    const id = a[3];
    if (seen[id]) continue;
    let label = a[4].replace(/<span[^>]*class="[^"]*accesshide[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
    const inst = /class="[^"]*instancename[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(label);
    if (inst) label = inst[1];
    label = stripTags(label);
    if (!label) continue;
    seen[id] = true;
    items.push({ id, modname: a[2], name: label, url: absolutize(a[1], BASE), descHtml: "" });
  }
  return items;
}

/** Découpe la page de cours en sections (nom, résumé, activités). */
function parseCourseHtml(html) {
  const src = String(html || "");
  const marks = [];
  const secRe = /id="section-(\d+)"/gi;
  let m;
  while ((m = secRe.exec(src))) marks.push({ index: Number(m[1]), at: m.index });

  const chunks = [];
  if (!marks.length) {
    chunks.push({ index: 0, html: src });
  } else {
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
      chunks.push({ index: marks[i].index, html: src.slice(marks[i].at, end) });
    }
  }

  const sections = [];
  for (const c of chunks) {
    let name = "";
    const h =
      /<h3[^>]*class="[^"]*sectionname[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(c.html) ||
      /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(c.html);
    if (h) name = stripTags(h[1]);
    if (!name) {
      const al = /aria-label="([^"]+)"/i.exec(c.html);
      if (al) name = decodeEntities(al[1]);
    }

    let summaryHtml = "";
    const sm =
      /<div[^>]+class="[^"]*\bsummarytext\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(c.html) ||
      /<div[^>]+class="[^"]*\bsummary\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(c.html);
    if (sm) summaryHtml = sm[1];

    const items = parseActivityBlocks(c.html);
    const inlineFiles = extractPluginfileUrls(c.html, BASE);
    if (items.length || inlineFiles.length || name || summaryHtml) {
      sections.push({ index: c.index, name, summaryHtml, items, inlineFiles, html: c.html });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
//  Conversion HTML -> Markdown (pour INDEX.md)
// ---------------------------------------------------------------------------

/** Chemin de `path` relatif à `fromDir`, pour des liens qui marchent en local. */
function relPath(fromDir, path) {
  const base = String(fromDir || "").replace(/\/+$/, "") + "/";
  const p = String(path || "");
  return p.indexOf(base) === 0 ? p.slice(base.length) : p;
}

function baseName(p) {
  const parts = String(p || "").split("/");
  return parts[parts.length - 1] || String(p || "");
}

/**
 * Cible d'un lien Markdown : chevrons si le chemin contient des espaces.
 *
 * On garde le chemin lisible plutôt que de tout percent-encoder : plusieurs
 * lecteurs Markdown ne décodent pas « %20 » pour retrouver un fichier local
 * et le lien ne mène alors nulle part.
 */
function mdTarget(url) {
  const u = String(url == null ? "" : url);
  return /[ ()<>]/.test(u) ? "<" + u + ">" : u;
}

function mdLink(label, url) {
  const lab = String(label == null ? "" : label).replace(/[\[\]]/g, "").trim() || "(sans titre)";
  const u = String(url == null ? "" : url);
  return u ? `[${lab}](${mdTarget(u)})` : lab;
}

/** Texte d'un fragment inline, balises retirées. */
function inlineText(html) {
  return stripTags(html).replace(/\s+/g, " ").trim();
}

function tableToMarkdown(tableHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(String(tableHtml)))) {
    const cells = [];
    const cRe = /<(t[hd])[^>]*>([\s\S]*?)<\/\1>/gi;
    let c;
    while ((c = cRe.exec(m[1]))) cells.push(inlineText(c[2]).replace(/\|/g, "\\|"));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";
  const head = rows[0];
  const out = ["", "| " + head.join(" | ") + " |", "| " + head.map(() => "---").join(" | ") + " |"];
  for (let i = 1; i < rows.length; i++) out.push("| " + rows[i].join(" | ") + " |");
  out.push("");
  return out.join("\n");
}

/**
 * Convertit du HTML Moodle en Markdown lisible.
 *
 * opts.resolve(href) remplace une URL par le chemin local du fichier déjà
 * téléchargé ; opts.minLevel fixe le niveau de titre le moins profond autorisé,
 * pour que le contenu s'emboîte sous les ## des sections sans tomber en ######.
 */
function htmlToMarkdown(html, opts) {
  const o = opts || {};
  const resolve = typeof o.resolve === "function" ? o.resolve : (u) => absolutize(u, BASE);
  const minLevel = o.minLevel || 1;
  let s = String(html == null ? "" : html);

  // Les cibles de liens sont remplacées par un jeton le temps de la
  // conversion : « <mon chemin/fichier.pdf> » serait sinon pris pour une
  // balise et effacé par le retrait final des balises.
  const targets = [];
  const hold = (u) => {
    targets.push(u);
    return "\u0001L" + (targets.length - 1) + "\u0001";
  };

  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");

  // Habillage Moodle sans intérêt dans une copie de lecture.
  s = s.replace(/<span[^>]+class="[^"]*\baccesshide\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, " ");
  s = s.replace(
    /<div[^>]+class="[^"]*\b(?:action-menu|actions|activity-badges|editing_|commands|availabilityinfo|completion)\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    " "
  );

  s = s.replace(/<table[\s\S]*?<\/table>/gi, (t) => tableToMarkdown(t));

  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => {
    const t = stripTags(c);
    return t ? "\n\n```\n" + t + "\n```\n\n" : "\n\n";
  });
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => {
    const t = inlineText(c);
    return t ? "`" + t + "`" : "";
  });

  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, c) => {
    const txt = inlineText(c);
    if (!txt) return "\n\n";
    const level = Math.min(6, Math.max(minLevel, Number(n)));
    return "\n\n" + "#".repeat(level) + " " + txt + "\n\n";
  });

  s = s.replace(/<img[^>]*>/gi, (tag) => {
    const src = (/src\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || "";
    const alt = (/alt\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || "";
    const url = src ? resolve(src) : "";
    return url ? `![${decodeEntities(alt)}](${hold(url)})` : "";
  });

  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = inlineText(body);
    if (!label) return "";
    const url = resolve(href);
    if (!url) return label;
    const lab = label.replace(/[\[\]]/g, "");
    return `[${lab}](${hold(url)})`;
  });

  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => {
    const t = inlineText(c);
    return t ? "**" + t + "**" : "";
  });
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => {
    const t = inlineText(c);
    return t ? "*" + t + "*" : "";
  });

  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "");
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  s = s.replace(/<\/(p|div|section|article|tr|blockquote)>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, "");

  s = decodeEntities(s);
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  // Les cibles reviennent maintenant que plus aucune balise n'est retirée.
  s = s.replace(/\u0001L(\d+)\u0001/g, (_, i) => mdTarget(targets[Number(i)]));
  return s.trim();
}

// ---------------------------------------------------------------------------
//  INDEX.md : copie Markdown de la page du cours
// ---------------------------------------------------------------------------
const ITEM_ICONS = {
  resource: "📄", folder: "📁", url: "🔗", page: "📝", book: "📖",
  assign: "📌", quiz: "❓", forum: "💬", label: "",
};

function itemIcon(modname) {
  const i = ITEM_ICONS[String(modname || "")];
  return i === undefined ? "•" : i;
}

function indentBlock(md, pad) {
  return String(md)
    .split("\n")
    .map((l) => (l.trim() ? pad + l : ""))
    .join("\n");
}

function renderItem(it) {
  const icon = itemIcon(it.modname);
  const head = icon ? icon + " " : "";
  const files = it.files || [];

  if (files.length === 1) return `- ${head}${mdLink(it.label, files[0])}`;
  if (files.length > 1) {
    const lines = [`- ${head}**${it.label}**`];
    for (const f of files) lines.push(`    - ${mdLink(baseName(f), f)}`);
    return lines.join("\n");
  }
  if (it.url) return `- ${head}${mdLink(it.label, it.url)}`;
  return `- ${head}${it.label}`;
}

/** Assemble le document final. */
function renderIndexMarkdown(doc) {
  const out = [`# ${doc.title}`, ""];
  out.push(`*Copie locale de <${doc.sourceUrl}> — ${doc.date}*`, "");
  if (CONFIG.saveIndexHtml) {
    out.push("*Liens qui ne s'ouvrent pas ? Utilise [INDEX.html](INDEX.html) dans un navigateur.*", "");
  }

  for (const sec of doc.sections || []) {
    const hasContent =
      (sec.summaryMd && sec.summaryMd.trim()) || (sec.items && sec.items.length);
    if (!hasContent && !sec.name) continue;

    out.push("---", "");
    out.push(`## ${sec.name || "Section"}`, "");

    if (sec.summaryMd && sec.summaryMd.trim()) out.push(sec.summaryMd.trim(), "");

    // Une ligne vide sépare toujours un bloc de texte d'une liste d'activités,
    // sans quoi un titre collé à une puce n'est plus reconnu comme titre.
    let lastWasBullet = false;
    const blank = () => { if (out.length && out[out.length - 1] !== "") out.push(""); };

    for (const it of sec.items || []) {
      if (it.kind === "text") {
        if (!it.md || !it.md.trim()) continue;
        blank();
        out.push(it.md.trim(), "");
        lastWasBullet = false;
        continue;
      }
      if (!lastWasBullet) blank();
      out.push(renderItem(it));
      if (it.descMd && it.descMd.trim()) {
        out.push("", indentBlock(it.descMd.trim(), "  "), "");
        lastWasBullet = false;
      } else {
        lastWasBullet = true;
      }
    }
    out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Réécrit href/src d'un fragment HTML vers les fichiers téléchargés. */
function rewriteLocalUrls(html, resolve) {
  return String(html || "").replace(
    /(href|src)\s*=\s*["']([^"']+)["']/gi,
    (_, attr, u) => `${attr}="${escapeXml(encodeURI(resolve(u)))}"`
  );
}

/** Remplace une URL par le chemin local du fichier téléchargé, s'il existe. */
function makeResolver(courseDir, localByUrl) {
  return (href) => {
    const abs = absolutize(href, BASE);
    const local = localByUrl[abs];
    return local ? relPath(courseDir, local) : abs;
  };
}

/**
 * Même contenu qu'INDEX.md, mais en page web.
 *
 * Sur iOS, la plupart des visionneuses Markdown n'ouvrent pas un lien relatif
 * vers un fichier voisin. Ouverte dans un navigateur, cette page-ci le fait.
 */
function renderIndexHtml(doc) {
  const esc = escapeXml;
  const href = (p) => esc(encodeURI(String(p || "")));
  const out = [
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(doc.title)}</title>`,
    "<style>",
    "body{font:17px/1.55 -apple-system,system-ui,sans-serif;margin:0 auto;padding:1.2em;" +
      "max-width:44em;color:#1c1c1e;background:#fff}",
    "h1{font-size:1.55em;margin:0 0 .2em}",
    "h2{margin:1.8em 0 .5em;padding-bottom:.25em;border-bottom:1px solid #d1d1d6;font-size:1.2em}",
    "ul.activities{list-style:none;padding:0;margin:.6em 0}",
    "ul.activities>li{margin:.5em 0}",
    ".ico{display:inline-block;width:1.4em}",
    ".desc{margin:.15em 0 .9em 1.4em;font-size:.94em;opacity:.85}",
    ".src{font-size:.85em;opacity:.65;margin-top:0}",
    "img{max-width:100%;height:auto}",
    "table{border-collapse:collapse;margin:.5em 0}td,th{border:1px solid #c7c7cc;padding:.25em .55em}",
    "@media (prefers-color-scheme:dark){body{background:#000;color:#e5e5ea}" +
      "a{color:#0a84ff}h2{border-color:#3a3a3c}td,th{border-color:#48484a}}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${esc(doc.title)}</h1>`,
    `<p class="src">Copie locale de <a href="${esc(doc.sourceUrl)}">${esc(doc.sourceUrl)}</a>` +
      ` — ${esc(doc.date)}</p>`,
  ];

  for (const sec of doc.sections || []) {
    out.push(`<h2>${esc(sec.name || "Section")}</h2>`);
    if (sec.summaryHtml && sec.summaryHtml.trim()) out.push(`<div>${sec.summaryHtml}</div>`);

    let openList = false;
    for (const it of sec.items || []) {
      if (it.kind === "text") {
        if (openList) { out.push("</ul>"); openList = false; }
        if (it.html && it.html.trim()) out.push(`<div>${it.html}</div>`);
        continue;
      }
      if (!openList) { out.push('<ul class="activities">'); openList = true; }

      const target = (it.files && it.files[0]) || it.url || "";
      const icon = itemIcon(it.modname);
      const label = esc(it.label || "(sans titre)");
      const main = target
        ? `<a href="${href(target)}">${label}</a>`
        : `<strong>${label}</strong>`;
      out.push(`<li><span class="ico">${icon}</span>${main}`);

      for (let i = 1; i < (it.files || []).length; i++) {
        out.push(`<br><span class="ico"></span><a href="${href(it.files[i])}">` +
                 `${esc(baseName(it.files[i]))}</a>`);
      }
      if (it.descHtml && it.descHtml.trim()) out.push(`<div class="desc">${it.descHtml}</div>`);
      out.push("</li>");
    }
    if (openList) out.push("</ul>");
  }

  out.push("</body>", "</html>");
  return out.join("\n");
}

function todayStamp() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
//  Nom du cours et dossier de destination
// ---------------------------------------------------------------------------

/** En-têtes de page qui ne sont PAS le nom d'un cours. */
const GENERIC_TITLES = new RegExp(
  "^(" +
  // Pages et sections génériques
  "cours|course|kurs|curso|accueil|home|tableau de bord|dashboard|mes cours|my courses|" +
  "moodle|navigation|menu|contenu|content|section \\\\d+|site|espace personnel|" +
  // Libellés de la barre Moodle — « Langue » a déjà nommé un dossier par erreur
  "langue|language|français|francais|english|recherche|search|rechercher|" +
  "notifications|messages|profil|profile|préférences|preferences|utilisateur|user|" +
  "déconnexion|deconnexion|connexion|se connecter|log ?in|log ?out|aide|help|" +
  "calendrier|calendar|fichiers personnels|mes fichiers|participants|badges|" +
  "notes|grades|rapports|reports|compétences|competences|basculer|toggle" +
  ")$", "i"
);

function isUsableCourseName(s) {
  const n = String(s == null ? "" : s).trim();
  return n.length >= 3 && !GENERIC_TITLES.test(n);
}

/**
 * Nettoie un titre brut issu du HTML.
 * Moodle écrit « Cours : Bases de données - Oracle | Moodle STRI ».
 * On retire le préfixe de type et le nom du site, SANS couper au premier
 * deux-points : beaucoup d'intitulés en contiennent.
 */
function cleanCourseTitle(raw) {
  let s = stripTags(raw);
  s = s.replace(/^\s*(?:cours|course|kurs|curso)\s*:\s*/i, "");
  s = s.replace(/\s*\|\s*[^|]*$/, "");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Nom complet du cours depuis une page HTML, par ordre de fiabilité
 * décroissante. Retourne "" si rien d'exploitable.
 */
function courseNameFromHtml(html, courseId) {
  const src = String(html || "");
  // Ceinture et bretelles : une page de connexion ne nomme jamais un cours.
  if (/id="page-login-index"|\bnotloggedin\b/i.test(src)) return "";
  const id = String(courseId);

  // Lien EXACT vers ce cours : « ?id=45 » et rien d'autre derrière.
  // Sans cette exigence on attrape les liens du sélecteur de langue
  // (…/course/view.php?id=45&lang=fr) et le dossier finit nommé « Langue ».
  const exact = '<a[^>]+href="[^"]*\\/course\\/view\\.php\\?id=' + id + '(?:#[^"]*)?"';

  const candidates = [];
  let m;

  // 1. En-tête de page des thèmes Boost / Classic : la source la plus sûre.
  m = /<div[^>]+class="[^"]*page-header-headings[^"]*"[^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(src);
  if (m) candidates.push(["en-tête de page", m[1]]);

  // 2. <title> : « Cours : <nom> | <site> ». Fiable sur tous les thèmes.
  m = /<title>([\s\S]*?)<\/title>/i.exec(src);
  if (m) candidates.push(["<title>", m[1]]);

  // 3. Attribut title du lien exact (fil d'Ariane).
  m = new RegExp(exact + '[^>]*title="([^"]+)"', "i").exec(src);
  if (m) candidates.push(["fil d'Ariane (title)", decodeEntities(m[1])]);

  // 4. Texte de ce même lien exact.
  m = new RegExp(exact + '[^>]*>([\\s\\S]*?)<\\/a>', "i").exec(src);
  if (m) candidates.push(["fil d'Ariane (texte)", m[1]]);

  // 5. En dernier recours, le premier <h1> non générique.
  const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let h;
  while ((h = h1Re.exec(src))) candidates.push(["<h1>", h[1]]);

  for (const c of candidates) {
    const n = cleanCourseTitle(c[1]);
    if (isUsableCourseName(n)) {
      log(`  · nom du cours via ${c[0]} : « ${n} »`);
      return n;
    }
  }
  warn(`  · aucun nom exploitable dans la page du cours ${id}.`);
  return "";
}

/** Nom imposé dans CONFIG.courseNames, prioritaire sur toute détection. */
function configuredCourseName(courseId) {
  const map = CONFIG.courseNames || {};
  const raw = map[courseId] != null ? map[courseId] : map[String(courseId)];
  const n = cleanCourseTitle(raw || "");
  return isUsableCourseName(n) ? n : "";
}

/** Nom de dossier pour un cours, selon CONFIG.includeCourseId. */
function courseDirName(courseId, name) {
  const clean = isUsableCourseName(name) ? name : `cours-${courseId}`;
  return sanitize(
    CONFIG.includeCourseId ? `${courseId} - ${clean}` : clean,
    `cours-${courseId}`
  );
}

/** Ancien dossier « <id> - … » laissé par une version précédente du script. */
function findLegacyCourseDir(courseId) {
  const prefix = `${courseId} - `;
  let entries = [];
  try { entries = fm.listContents(ROOT) || []; } catch (e) { return null; }
  for (const e of entries) {
    if (e.indexOf(prefix) !== 0) continue;
    const p = fm.joinPath(ROOT, e);
    if (fm.isDirectory(p)) return p;
  }
  return null;
}

/**
 * Dossier du cours, créé si besoin. Si le cours était rangé sous un autre nom
 * (« 45 - Cours »), le dossier est renommé et les chemins du manifeste suivent,
 * pour ne rien re-télécharger.
 */
function resolveCourseDir(courseId, name) {
  const target = fm.joinPath(ROOT, courseDirName(courseId, name));

  if (!manifest.__courses) manifest.__courses = {};
  const previous = manifest.__courses[courseId] || findLegacyCourseDir(courseId);

  if (previous && previous !== target && fm.fileExists(previous) && !fm.fileExists(target)) {
    try {
      fm.move(previous, target);
      for (const k of Object.keys(manifest)) {
        if (k === "__courses") continue;
        const p = manifest[k] && manifest[k].path;
        if (p && p.indexOf(previous + "/") === 0) {
          manifest[k].path = target + p.slice(previous.length);
        }
      }
      log(`  ↻ Dossier renommé : « ${fm.fileName(previous, true)} » → « ${fm.fileName(target, true)} »`);
    } catch (e) {
      warn(`Renommage du dossier de cours impossible : ${e}`);
    }
  }

  manifest.__courses[courseId] = target;
  return ensureDir(target);
}

// ---------------------------------------------------------------------------
//  Synchronisation — mode service web (API REST)
// ---------------------------------------------------------------------------
async function courseNameWS(token, courseId) {
  // displayname porte le nom tel qu'affiché (filtres appliqués).
  let r = await safe(
    () => wsCall(token, "core_course_get_courses_by_field", { field: "id", value: courseId }),
    null
  );
  let c = r && r.courses && r.courses[0];
  if (c) {
    const n = cleanCourseTitle(c.displayname || c.fullname || c.shortname || "");
    if (isUsableCourseName(n)) return n;
  }

  // Repli : certains sites restreignent get_courses_by_field.
  r = await safe(() => wsCall(token, "core_course_get_courses", { options: { ids: [courseId] } }), null);
  c = Array.isArray(r) ? r[0] : null;
  if (c) {
    const n = cleanCourseTitle(c.displayname || c.fullname || c.shortname || "");
    if (isUsableCourseName(n)) return n;
  }

  return `cours-${courseId}`;
}

/** Transforme les sections collectées en document Markdown prêt à rendre. */
function buildIndexDoc(title, sourceUrl, courseDir, localByUrl, rawSections) {
  const resolve = makeResolver(courseDir, localByUrl);
  return {
    title,
    sourceUrl,
    date: todayStamp(),
    sections: rawSections.map((sec) => ({
      name: sec.name,
      summaryMd: htmlToMarkdown(sec.summaryHtml, { resolve, minLevel: 3 }),
      summaryHtml: rewriteLocalUrls(sec.summaryHtml, resolve),
      items: (sec.items || []).map((it) =>
        it.kind === "text"
          ? {
              kind: "text",
              md: htmlToMarkdown(it.html, { resolve, minLevel: 3 }),
              html: rewriteLocalUrls(it.html, resolve),
            }
          : {
              kind: "item",
              modname: it.modname,
              label: it.label,
              url: it.url,
              files: (it.files || []).map((f) => relPath(courseDir, f)),
              descMd: htmlToMarkdown(it.html, { resolve, minLevel: 4 }),
              descHtml: rewriteLocalUrls(it.html, resolve),
            }
      ),
    })),
  };
}

async function syncCourseWS(token, courseId, courseName) {
  let name = configuredCourseName(courseId) || cleanCourseTitle(courseName || "");
  if (!isUsableCourseName(name)) name = await courseNameWS(token, courseId);
  const courseDir = resolveCourseDir(courseId, name);
  log(`\n📚 ${name}  (id ${courseId})`);

  const sections = await wsCall(token, "core_course_get_contents", { courseid: courseId });
  if (!Array.isArray(sections)) throw new Error("Contenu du cours illisible.");

  const links = [];
  const localByUrl = {};
  const rawSections = [];

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const num = typeof sec.section === "number" ? sec.section : s;
    const secLabel = stripTags(sec.name) || `Section ${num}`;
    const secDir = fm.joinPath(
      courseDir,
      sanitize(`${pad2(num)} - ${secLabel}`, `section-${num}`)
    );
    log(`  📂 ${secLabel}`);

    const docSec = { name: secLabel, summaryHtml: sec.summary || "", items: [] };

    const modules = Array.isArray(sec.modules) ? sec.modules : [];
    for (const mod of modules) {
      const modName = stripTags(mod.name) || mod.modname;
      const contents = Array.isArray(mod.contents) ? mod.contents : [];
      const files = contents.filter((c) => c.type === "file" && c.fileurl);
      const urls = contents.filter((c) => c.type === "url" && c.fileurl);

      // Une étiquette n'est qu'un bloc de texte sur la page du cours.
      if (mod.modname === "label") {
        docSec.items.push({ kind: "text", html: mod.description || "" });
        continue;
      }

      for (const u of urls) {
        writeLink(sideDestDir(courseDir, secDir, "Liens"), modName, u.fileurl, links);
        log(`      ↗︎ ${modName}`);
      }

      const savedPaths = [];

      if (files.length) {
        const multi = files.length > 1;

        for (const f of files) {
          let fname = f.filename || filenameFromUrl(f.fileurl, modName);
          if (!multi && /^index\.html?$/i.test(fname)) fname = `${sanitize(modName, "page")}.html`;
          else if (!multi && files.length === 1 && fname && !/\./.test(fname)) {
            fname = sanitize(modName, fname);
          }

          const dir = fileDestDir({
            courseDir, secDir, modName, modId: mod.id, modname: mod.modname,
            filename: fname, multi, filepath: f.filepath,
          });

          const url = withParams(f.fileurl, { token, forcedownload: 1 });
          const saved = await safe(
            () =>
              saveFile(NetClient, dir, fname, url, {
                key: `${courseId}:${mod.id}:${f.filepath || "/"}${f.filename || fname}`,
                size: Number(f.filesize || 0),
                time: Number(f.timemodified || 0),
                label: modName,
              }),
            null
          );
          if (saved) {
            savedPaths.push(saved);
            localByUrl[absolutize(f.fileurl, BASE)] = saved;
          }
        }
      } else if (mod.url && !urls.length && mod.modname !== "url") {
        // Pas de fichier exposé : on garde au moins le lien vers l'activité.
        writeLink(sideDestDir(courseDir, secDir, "Liens", "_activités"), modName, mod.url, null);
      }

      docSec.items.push({
        kind: "item",
        modname: mod.modname,
        label: modName,
        url: urls.length ? urls[0].fileurl : mod.url || "",
        files: savedPaths,
        html: mod.description || "",
      });
    }

    rawSections.push(docSec);
  }

  finishCourse(
    courseDir,
    name,
    links,
    buildIndexDoc(name, `${BASE}/course/view.php?id=${courseId}`, courseDir, localByUrl, rawSections)
  );
}

// ---------------------------------------------------------------------------
//  Synchronisation — mode HTML (session web ou WebView)
// ---------------------------------------------------------------------------
async function syncCourseHTML(client, courseId, courseName) {
  const url = `${BASE}/course/view.php?id=${courseId}`;
  const res = await client.fetch(url);

  // La réponse peut arriver en binaire si le serveur annonce mal son type :
  // on récupère quand même le texte au lieu de conclure à une session perdue.
  let html = String(res.text || "");
  if (!html && res.data) {
    try { html = res.data.toRawString(); } catch (e) { html = ""; }
  }

  if (!html) {
    throw new Error(
      `Cours ${courseId} : réponse vide — HTTP ${res.status || "?"}, ` +
      `type « ${res.contentType || "inconnu"} », URL finale ${res.finalUrl || url}.`
    );
  }

  if (!isLoggedInHtml(html)) {
    const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    const titre = stripTags(t ? t[1] : "") || "sans titre";
    const cause = looksLikeSso(res.finalUrl, html)
      ? "redirection vers le portail SSO"
      : "page de connexion Moodle";
    throw new Error(
      `Cours ${courseId} : session non reconnue (${cause}). ` +
      `Page reçue : « ${titre} » — HTTP ${res.status || "?"}, URL ${res.finalUrl || url}.`
    );
  }

  if (/\/enrol\/index\.php/i.test(String(res.finalUrl || "")) || /id="page-enrol-index"/i.test(html)) {
    throw new Error(`Cours ${courseId} : inscription requise — ce compte n'y est pas inscrit.`);
  }

  const name =
    configuredCourseName(courseId) ||
    cleanCourseTitle(courseName || "") ||
    courseNameFromHtml(html, courseId) ||
    `cours-${courseId}`;
  const courseDir = resolveCourseDir(courseId, name);
  log(`\n📚 ${name}  (id ${courseId})`);

  const sections = parseCourseHtml(html);
  const links = [];
  const localByUrl = {};
  const rawSections = [];

  for (const sec of sections) {
    const secLabel = sec.name || `Section ${sec.index}`;
    const secDir = fm.joinPath(
      courseDir,
      sanitize(`${pad2(sec.index)} - ${secLabel}`, `section-${sec.index}`)
    );
    log(`  📂 ${secLabel}`);

    const docSec = { name: secLabel, summaryHtml: sec.summaryHtml || "", items: [] };

    for (const f of sec.inlineFiles) {
      const fname = filenameFromUrl(f, "fichier");
      const dir = fileDestDir({
        courseDir, secDir, modName: secLabel, modId: sec.index,
        modname: "", filename: fname, multi: false,
      });
      const saved = await safe(
        () => saveFile(client, dir, fname, f, { key: `${courseId}:inline:${f}` }),
        null
      );
      if (saved) localByUrl[f] = saved;
    }

    for (const mod of sec.items) {
      // Étiquette : du texte, pas une activité à télécharger.
      if (!mod.url) {
        docSec.items.push({ kind: "text", html: mod.descHtml || "" });
        continue;
      }

      const outcome =
        (await safe(
          () => handleModuleHTML(client, mod, { courseDir, secDir }, courseId, links, localByUrl),
          null
        )) || {};

      docSec.items.push({
        kind: "item",
        modname: mod.modname,
        label: mod.name || mod.modname,
        url: outcome.target || mod.url,
        files: outcome.files || [],
        html: mod.descHtml || "",
      });
    }

    rawSections.push(docSec);
  }

  finishCourse(
    courseDir,
    name,
    links,
    buildIndexDoc(name, url, courseDir, localByUrl, rawSections)
  );
}

/**
 * Traite une activité. Retourne { files: [chemins locaux], target: URL retenue }
 * pour que INDEX.md pointe vers le fichier téléchargé quand il existe.
 */
async function handleModuleHTML(client, mod, dirs, courseId, links, localByUrl) {
  const { courseDir, secDir } = dirs;
  const modLabel = mod.name || mod.modname;
  const files = [];
  const remember = (remoteUrl, path) => {
    if (!path) return;
    files.push(path);
    if (remoteUrl) localByUrl[absolutize(remoteUrl, BASE)] = path;
  };
  const destFor = (filename, multi) =>
    fileDestDir({
      courseDir, secDir, modName: modLabel, modId: mod.id,
      modname: mod.modname, filename, multi: !!multi,
    });

  // 1. Liens externes : on demande à Moodle de ne pas rediriger.
  if (mod.modname === "url") {
    let target = "";
    const page = await safe(() => client.fetch(withParams(mod.url, { redirect: 0 })), null);
    const pageHtml = String((page && page.text) || "");
    if (pageHtml) {
      const w =
        /<div[^>]*class="[^"]*urlworkaround[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i.exec(pageHtml) ||
        /<a[^>]+href="([^"]+)"[^>]*>\s*(?:Cliquez|Click|Ouvrir)/i.exec(pageHtml);
      if (w) target = absolutize(w[1], mod.url);
      if (!target) {
        const embeds = extractEmbeds(pageHtml, mod.url);
        if (embeds.length) target = embeds[0];
      }
    }
    if (!target && client.redirectTarget) target = await client.redirectTarget(mod.url);
    if (!target) target = mod.url;

    if (isSameSite(target) && /pluginfile\.php/i.test(target)) {
      const fname = filenameFromUrl(target, modLabel);
      const saved = await saveFile(client, destFor(fname), fname, target, {
        key: `${courseId}:${mod.id}:url-file`,
        label: modLabel,
      });
      remember(target, saved);
    } else {
      writeLink(sideDestDir(courseDir, secDir, "Liens"), modLabel, target, links);
      log(`      ↗︎ ${modLabel}`);
    }
    return { files, target };
  }

  // 2. Pages / livres : on enregistre le contenu en HTML lisible hors-ligne.
  if (mod.modname === "page" || mod.modname === "book") {
    const page = await client.fetch(mod.url);
    const pageHtml = String(page.text || "");
    if (!pageHtml) return { files, target: mod.url };

    const pagesDir = sideDestDir(courseDir, secDir, "Pages");
    const saved = savePage(pagesDir, modLabel, pageHtml, mod.url);
    remember(mod.url, saved);
    await downloadAssets(client, pageHtml, mod, dirs, courseId, links, localByUrl);

    if (mod.modname === "book") {
      const chapRe = /href="([^"]*\/mod\/book\/view\.php\?id=\d+(?:&amp;|&)chapterid=(\d+)[^"]*)"/gi;
      const done = {};
      const bookDir = byCategories()
        ? pagesDir
        : fm.joinPath(secDir, sanitize(modLabel, "livre"));
      let c;
      while ((c = chapRe.exec(pageHtml))) {
        if (done[c[2]]) continue;
        done[c[2]] = true;
        const chapUrl = absolutize(c[1], mod.url);
        const chap = await safe(() => client.fetch(chapUrl), null);
        const chtml = String((chap && chap.text) || "");
        if (!chtml) continue;
        const title = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(chtml);
        const chapName = `${modLabel} - ${stripTags(title ? title[1] : "") || `chapitre ${c[2]}`}`;
        remember(chapUrl, savePage(bookDir, chapName, chtml, chapUrl));
        await downloadAssets(client, chtml, mod, dirs, courseId, links, localByUrl);
      }
    }
    return { files, target: mod.url };
  }

  // 3. Cas général (ressource, dossier, devoir, glossaire…).
  const res = await client.fetch(mod.url);

  // Moodle a servi le fichier lui-même — binaire, mais aussi texte (.sql, .txt…).
  if (!looksLikeWebPage(res)) {
    const key = `${courseId}:${mod.id}:direct`;

    let fname = sanitize(filenameFromDisposition(res.disposition), "");
    if (!fname) {
      const fromUrl = filenameFromUrl(res.finalUrl, "");
      if (fromUrl && /\.[a-z0-9]{1,8}$/i.test(fromUrl) && !/^view\.php/i.test(fromUrl)) {
        fname = sanitize(fromUrl, "");
      }
    }
    if (!fname) {
      const ext = /\.[a-z0-9]{1,8}$/i.test(modLabel) ? "" : extForContentType(res.contentType);
      fname = sanitize(modLabel + ext, modLabel);
    }

    let data = res.data;
    if (!data && res.text != null) data = Data.fromString(res.text);
    if (!data) return { files, target: mod.url };

    const destDir = destFor(fname);
    const path = uniquePath(ensureDir(destDir), fname, key, modLabel);
    if (!CONFIG.overwrite && relocate(key, path, destDir)) {
      log(`      ↦ ${fm.fileName(path, true)}`);
      remember(mod.url, path);
      return { files, target: mod.url };
    }
    if (!CONFIG.overwrite && fm.fileExists(path) && manifest[key]) {
      stats.skipped++;
      log(`      = ${fm.fileName(path, true)}`);
      remember(mod.url, path);
      return { files, target: mod.url };
    }
    fm.write(path, data);
    const written = Math.round((fm.fileSize(path) || 0) * 1024);
    manifest[key] = { path, size: res.size || written, time: 0 };
    stats.files++;
    stats.bytes += res.size || written;
    log(`      ↓ ${fm.fileName(path, true)} (${humanSize(res.size || written)})`);
    remember(mod.url, path);
    return { files, target: mod.url };
  }

  const pageHtml = String(res.text || "");
  if (!pageHtml) return { files, target: mod.url };

  const found = extractPluginfileUrls(pageHtml, mod.url);
  const multi = found.length > 1;
  for (const f of found) {
    const fname = filenameFromUrl(f, modLabel);
    const saved = await safe(
      () =>
        saveFile(client, destFor(fname, multi), fname, f, {
          key: `${courseId}:${mod.id}:${f}`,
          label: modLabel,
        }),
      null
    );
    remember(f, saved);
  }

  for (const e of extractEmbeds(pageHtml, mod.url)) {
    writeLink(sideDestDir(courseDir, secDir, "Liens"), `${modLabel} - média`, e, links);
    log(`      ↗︎ média intégré : ${e}`);
  }

  if (!found.length && !mod.url.includes("/mod/label/")) {
    writeLink(sideDestDir(courseDir, secDir, "Liens", "_activités"), modLabel, mod.url, null);
  }

  return { files, target: mod.url };
}

/** Images/fichiers référencés dans une page + médias intégrés. */
async function downloadAssets(client, html, mod, dirs, courseId, links, localByUrl) {
  const { courseDir, secDir } = dirs;
  const label = mod.name || mod.modname;
  const found = extractPluginfileUrls(html, mod.url);
  for (const f of found) {
    const fname = filenameFromUrl(f, "fichier");
    const dir = byCategories()
      ? fm.joinPath(courseDir, categoryFor(fname, ""))
      : fm.joinPath(secDir, sanitize(`${label} - fichiers`, "fichiers"));
    const saved = await safe(
      () =>
        saveFile(client, dir, fname, f, {
          key: `${courseId}:${mod.id}:${f}`,
          label,
        }),
      null
    );
    if (saved && localByUrl) localByUrl[absolutize(f, BASE)] = saved;
  }
  for (const e of extractEmbeds(html, mod.url)) {
    writeLink(sideDestDir(courseDir, secDir, "Liens", `${label} - fichiers`), `${label} - média`, e, links);
  }
}

/** Écrit LIENS.md et INDEX.md à la fin d'un cours. */
function finishCourse(courseDir, name, links, doc) {
  if (CONFIG.saveLinks && links.length) {
    const md = [`# Liens externes — ${name}`, ""]
      .concat(links.map((l) => `- [${l.name}](${l.url})`))
      .join("\n");
    try { fm.writeString(fm.joinPath(courseDir, "LIENS.md"), md + "\n"); }
    catch (e) { fail("LIENS.md : " + e); }
  }
  if (CONFIG.saveIndex && doc) {
    try { fm.writeString(fm.joinPath(courseDir, "INDEX.md"), renderIndexMarkdown(doc)); }
    catch (e) { fail("INDEX.md : " + e); }
  }
  if (CONFIG.saveIndexHtml && doc) {
    try { fm.writeString(fm.joinPath(courseDir, "INDEX.html"), renderIndexHtml(doc)); }
    catch (e) { fail("INDEX.html : " + e); }
  }
}

// ---------------------------------------------------------------------------
//  Orchestration
// ---------------------------------------------------------------------------
/** Oublie le jeton mémorisé : la prochaine connexion repassera par le navigateur. */
function forgetAuth() {
  if (Keychain.contains(KC.token)) Keychain.remove(KC.token);
  log("Jeton oublié.");
}

/** Supprime les identifiants stockés par les anciennes versions du script. */
function purgeLegacyCredentials() {
  for (const k of KC_LEGACY) {
    if (Keychain.contains(k)) {
      Keychain.remove(k);
      log(`Ancien identifiant « ${k} » supprimé du trousseau.`);
    }
  }
}

function resolveCourseIds() {
  let ids = (CONFIG.courseIds || []).map(Number).filter((n) => n > 0);
  try {
    const q = args.queryParameters || {};
    const raw = q.courseid || q.courseids || (args.shortcutParameter ? String(args.shortcutParameter) : "");
    if (raw) {
      const parsed = String(raw).split(/[,;\s]+/).map(Number).filter((n) => n > 0);
      if (parsed.length) ids = parsed;
    }
  } catch (e) { /* hors Shortcuts : rien à faire */ }
  return ids;
}

/** Connexion par le navigateur : indispensable avec un SSO / CAS. */
async function connectViaWebView() {
  const session = await webViewLogin();
  const detected = session.detected;
  log("✓ Session ouverte dans la WebView.");
  // Bonus : si la page « Clés de sécurité » expose un jeton, on passe en mode API.
  const t = await safe(() => tokenFromManageTokenPage(WebViewClient), null);
  if (t && (await validateToken(t))) {
    Keychain.set(KC.token, t);
    log("✓ Jeton de service web récupéré : mode API activé (plus rapide).");
    return { mode: "ws", token: t, client: NetClient, detected };
  }
  return { mode: "wv", token: null, client: WebViewClient, wv: session.wv, detected };
}

/**
 * Authentification : connexion dans le navigateur, et rien d'autre.
 *
 * Un jeton de service web récupéré lors d'une connexion précédente est réutilisé
 * s'il est encore valable — c'est la même authentification, simplement mémorisée.
 * Mets CONFIG.reuseToken à false pour repasser par le navigateur à chaque fois.
 */
async function connect() {
  // Le navigateur sert aussi à choisir le cours : quand followBrowserCourse est
  // actif, on l'ouvre même si un jeton valide est mémorisé. La session y est
  // déjà ouverte, il n'y a donc rien à ressaisir.
  if (CONFIG.reuseToken && !CONFIG.followBrowserCourse && Keychain.contains(KC.token)) {
    const token = Keychain.get(KC.token);
    const info = await validateToken(token);
    if (info) {
      log(`✓ Jeton mémorisé valide — connecté en tant que ${info.username}.`);
      return { mode: "ws", token, client: NetClient, info };
    }
    Keychain.remove(KC.token);
    warn("Jeton mémorisé expiré — reconnexion dans le navigateur.");
  }

  if (!config.runsInApp) {
    throw new Error(
      "La connexion navigateur demande une interaction : lance le script depuis " +
      "l'app Scriptable pour t'authentifier, puis le jeton mémorisé prendra le relais."
    );
  }

  return await connectViaWebView();
}

async function listMyCoursesWS(token, info) {
  const userid = info && info.userid ? info.userid : (await validateToken(token) || {}).userid;
  if (!userid) return [];
  const courses = await safe(() => wsCall(token, "core_enrol_get_users_courses", { userid }), []);
  return (courses || []).map((c) => ({
    id: c.id,
    name: cleanCourseTitle(c.displayname || c.fullname || c.shortname || ""),
  }));
}

function summary(started) {
  const secs = Math.round((Date.now() - started) / 1000);
  const lines = [
    "",
    "──────────── Résumé ────────────",
    `Fichiers téléchargés : ${stats.files} (${humanSize(stats.bytes)})`,
    `Déjà à jour          : ${stats.skipped}`,
    `Déplacés             : ${stats.moved}`,
    `Rangement            : ${byCategories() ? "par catégories" : "par sections"}`,
    `Pages enregistrées   : ${stats.pages}`,
    `Liens externes       : ${stats.links}`,
    `Erreurs              : ${stats.errors.length}`,
    `Durée                : ${secs}s`,
    `Dossier              : ${ROOT}`,
  ];
  if (stats.errors.length) {
    lines.push("", "Détails des erreurs :");
    for (const e of stats.errors.slice(0, 15)) lines.push(`  • ${e}`);
    if (stats.errors.length > 15) lines.push(`  • … ${stats.errors.length - 15} autres`);
  }
  return lines.join("\n");
}

async function main() {
  const started = Date.now();
  purgeLegacyCredentials();
  if (CONFIG.resetAuth) forgetAuth();

  ensureDir(ROOT);
  log(`Destination : ${ROOT}`);
  await loadManifest();

  if (CONFIG.askLayout && config.runsInApp) {
    const a = new Alert();
    a.title = "Rangement des fichiers";
    a.message = "Comment ranger les fichiers de ce cours ?";
    a.addAction("Par sections du cours");
    a.addAction("Par catégories (Documents, Vidéos…)");
    a.addCancelAction("Annuler");
    const c = await a.presentAlert();
    if (c === -1) throw new Error("Annulé.");
    CONFIG.layout = c === 1 ? "categories" : "sections";
  }
  log(`Rangement : ${byCategories() ? "par catégories" : "par sections"}`);

  const auth = await connect();
  let targets = resolveCourseIds().map((id) => ({ id, name: null }));

  const picked = auth.detected;
  if (CONFIG.followBrowserCourse && picked && picked.id) {
    targets = [{ id: picked.id, name: picked.name || null }];
    log(`Cours retenu : « ${picked.name || "id " + picked.id} » (id ${picked.id}).`);
  } else if (auth.mode === "ws" && CONFIG.allMyCourses) {
    const mine = await listMyCoursesWS(auth.token, auth.info);
    if (mine.length) targets = mine;
  }
  if (!targets.length) throw new Error("Aucun identifiant de cours à traiter (CONFIG.courseIds).");

  log(`Mode : ${auth.mode} — ${targets.length} cours à synchroniser.`);

  for (const t of targets) {
    try {
      if (auth.mode === "ws") await syncCourseWS(auth.token, t.id, t.name);
      else await syncCourseHTML(auth.client, t.id, t.name);
    } catch (e) {
      fail(`Cours ${t.id} : ${e && e.message ? e.message : e}`);
    }
    saveManifest();
  }

  saveManifest();
  const text = summary(started);
  console.log(text);

  if (CONFIG.notify) {
    const n = new Notification();
    n.title = "Moodle STRI";
    n.body = `${stats.files} fichier(s), ${stats.skipped} déjà à jour, ${stats.errors.length} erreur(s).`;
    n.sound = "default";
    await n.schedule();
  }

  if (config.runsInApp) {
    const done = new Alert();
    done.title = "Synchronisation terminée";
    done.message = text;
    done.addAction("Ouvrir le dossier");
    done.addAction("Exporter vers Fichiers");
    done.addAction("Copier le chemin");
    done.addCancelAction("Fermer");
    const choice = await done.presentAlert();

    if (choice === 0) {
      openInFiles(ROOT);
    } else if (choice === 1) {
      // Filet de sécurité : copie le dossier là où l'utilisateur le souhaite.
      await safe(() => DocumentPicker.export(ROOT), null);
    } else if (choice === 2) {
      Pasteboard.copy(ROOT);
    }
  }
  Script.setShortcutOutput(text);
  Script.complete();
}

await main().catch(async (e) => {
  const msg = e && e.message ? e.message : String(e);
  console.error(msg);
  if (config.runsInApp) {
    const a = new Alert();
    a.title = "Erreur";
    a.message = msg;
    a.addCancelAction("Fermer");
    await a.presentAlert();
  } else if (CONFIG.notify) {
    const n = new Notification();
    n.title = "Moodle STRI — erreur";
    n.body = msg;
    await n.schedule();
  }
  Script.complete();
});
