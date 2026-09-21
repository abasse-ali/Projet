// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: graduation-cap;
//
// ============================================================================
//  Moodle STRI  ->  app Fichiers (iCloud Drive)
//  Télécharge le contenu d'un ou plusieurs cours Moodle (documents, vidéos,
//  images, pages, liens externes) et le range dans Fichiers, section par
//  section, en évitant de re-télécharger ce qui est déjà présent.
//
//  Site par défaut : https://www.stri.fr/eformation   (cours id=45)
//
//  3 modes de connexion, essayés dans cet ordre :
//    1. "ws"  : jeton de service web Moodle (API REST) — le plus fiable
//    2. "web" : identifiant + mot de passe sur /login/index.php (session)
//    3. "wv"  : connexion dans une WebView (indispensable si SSO / CAS),
//               les téléchargements passent ensuite par la session du WebView
//
//  Voir README.md pour l'installation pas à pas.
// ============================================================================

const CONFIG = {
  // --- Site et cours -------------------------------------------------------
  baseUrl: "https://www.stri.fr/eformation",
  courseIds: [45],          // ex. [45, 52, 61]
  allMyCourses: false,      // true = tous les cours où je suis inscrit (mode ws)

  // --- Stockage ------------------------------------------------------------
  rootFolderName: "Moodle STRI",  // dossier créé dans Scriptable (Fichiers)
  useICloud: true,                // false = stockage local à l'app
  overwrite: false,               // true = re-télécharge tout à chaque fois
  maxFileMB: 0,                   // 0 = pas de limite ; ex. 300 pour éviter les gros films
  maxFileMBWebView: 60,           // limite spécifique au mode WebView (pont JS)

  // --- Contenus ------------------------------------------------------------
  downloadFiles: true,      // documents, vidéos, images…
  savePages: true,          // "Pages" Moodle enregistrées en .html
  saveLinks: true,          // liens externes -> fichiers .url + LIENS.md
  linkFileFormat: "url",    // "url" | "html" | "webloc"
  saveIndex: true,          // INDEX.md récapitulatif par cours
  saveImagesToPhotos: false,// true = copie aussi les images dans Photos

  // --- Divers --------------------------------------------------------------
  notify: true,             // notification iOS à la fin
  verbose: true,
  resetCredentials: false,  // true = oublie identifiants/jeton mémorisés puis redemande
};

// ---------------------------------------------------------------------------
//  Constantes internes
// ---------------------------------------------------------------------------
const BASE = String(CONFIG.baseUrl).replace(/\/+$/, "");
const ORIGIN = (BASE.match(/^https?:\/\/[^/]+/) || [BASE])[0];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const KC = {
  token: "moodle_stri_token",
  user: "moodle_stri_user",
  pass: "moodle_stri_pass",
};

const stats = { files: 0, skipped: 0, links: 0, pages: 0, bytes: 0, errors: [] };

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

const ROOT = fm.joinPath(fm.documentsDirectory(), CONFIG.rootFolderName);

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

/** Chemin libre : ajoute " (2)", " (3)"… si le nom est déjà pris par autre chose. */
function uniquePath(dir, filename, key) {
  let name = filename;
  let path = fm.joinPath(dir, name);
  let n = 2;
  while (fm.fileExists(path) && manifest[key] && manifest[key].path !== path) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : "";
    name = `${stem} (${n})${ext}`;
    path = fm.joinPath(dir, name);
    n++;
    if (n > 50) break;
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
      (async () => {
        try {
          const r = await fetch(${JSON.stringify(url)}, { credentials: "include", redirect: "follow" });
          const ct = r.headers.get("content-type") || "";
          const cd = r.headers.get("content-disposition") || "";
          const textish = /^(text\\/|application\\/(json|javascript|xhtml))/i.test(ct);
          if (textish || !${wantBinary ? "true" : "false"}) {
            const t = await r.text();
            completion({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, text: t });
            return;
          }
          const b = await r.blob();
          if (b.size > ${cap}) {
            completion({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, size: b.size, tooLarge: true });
            return;
          }
          const b64 = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(",")[1] || "");
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(b);
          });
          completion({ ok: r.ok, status: r.status, url: r.url, contentType: ct, disposition: cd, size: b.size, b64 });
        } catch (e) {
          completion({ ok: false, status: 0, error: String(e) });
        }
      })();`;
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

/**
 * Télécharge une URL vers `dir/filename`, en sautant ce qui est déjà à jour.
 * meta = { key, size, time }
 */
async function saveFile(client, dir, filename, url, meta) {
  if (!CONFIG.downloadFiles) return null;
  const key = meta.key;
  const known = manifest[key];
  const name = sanitize(filename, "fichier");
  const target = uniquePath(ensureDir(dir), name, key);

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
    if (/id="?login"?|loginform|login\/index\.php/i.test(res.text) && /<html/i.test(res.text)) {
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
    finalPath = uniquePath(dir, fromHeader, key);
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
  if (!CONFIG.savePages) return;
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
    fm.writeString(fm.joinPath(ensureDir(dir), label + ".html"), doc);
    stats.pages++;
    log(`      ✎ ${label}.html`);
  } catch (e) {
    fail(`Page « ${label} » : ${e}`);
  }
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

async function tokenFromCredentials(user, pass) {
  const r = await http(`${BASE}/login/token.php`, {
    as: "json",
    form: { username: user, password: pass, service: "moodle_mobile_app" },
  });
  const j = r.payload || {};
  if (j.token) return j.token;
  throw new Error(j.error || j.errorcode || "login/token.php : réponse inattendue");
}

/** Décode un lien « moodlemobile://token=... » copié après une connexion SSO. */
function tokenFromLaunchUrl(raw) {
  const m = /token=([A-Za-z0-9+/=%_-]+)/.exec(String(raw || ""));
  if (!m) throw new Error("Lien invalide : paramètre token absent.");
  let b64 = decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  let decoded = "";
  try { decoded = Data.fromBase64String(b64).toRawString(); } catch (e) { decoded = ""; }
  const parts = String(decoded).split(":::");
  const token = (parts.length > 1 ? parts[1] : parts[0] || "").trim();
  if (!token) throw new Error("Impossible de décoder le jeton.");
  return token;
}

async function validateToken(token) {
  if (!token) return null;
  const info = await safe(() => wsCall(token, "core_webservice_get_site_info", {}), null);
  return info && info.username ? info : null;
}

async function askCredentials(message) {
  const a = new Alert();
  a.title = "Identifiants Moodle";
  a.message = message || `Connexion à ${ORIGIN}`;
  a.addTextField("Identifiant", Keychain.contains(KC.user) ? Keychain.get(KC.user) : "");
  a.addSecureTextField("Mot de passe", "");
  a.addAction("Se connecter");
  a.addCancelAction("Annuler");
  const idx = await a.presentAlert();
  if (idx === -1) return null;
  const user = (a.textFieldValue(0) || "").trim();
  const pass = a.textFieldValue(1) || "";
  if (!user || !pass) return null;
  Keychain.set(KC.user, user);
  Keychain.set(KC.pass, pass);
  return { user, pass };
}

/** Connexion « classique » par formulaire (mode web, session par cookie). */
async function webLogin(user, pass) {
  const page = await http(`${BASE}/login/index.php`, { as: "string" });
  const html = String(page.payload || "");
  const m = /name="logintoken"\s+value="([^"]+)"/i.exec(html) ||
            /value="([^"]+)"\s+name="logintoken"/i.exec(html);
  const form = { username: user, password: pass, anchor: "" };
  if (m) form.logintoken = m[1];

  const res = await http(`${BASE}/login/index.php`, {
    as: "string",
    form,
    headers: { Referer: `${BASE}/login/index.php` },
  });
  const body = String(res.payload || "");
  if (/loginerrors|invalidlogin|Identifiant ou mot de passe/i.test(body)) {
    throw new Error("Identifiant ou mot de passe refusé par Moodle.");
  }
  const check = await http(`${BASE}/my/`, { as: "string" });
  const ok = /sesskey|logout\.php|Déconnexion/i.test(String(check.payload || ""));
  if (!ok) throw new Error("Connexion non confirmée (SSO/CAS ou double authentification ?).");
  return true;
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

  // On se replace sur le domaine Moodle : les fetch() suivants doivent être
  // « same-origin » (si la connexion se termine sur le portail SSO, CORS bloque).
  await safe(() => wv.loadURL(`${BASE}/my/`), null);
  await WebViewClient.ensure(wv);
  const probe = await WebViewClient.run(`${BASE}/my/`, false);
  const html = String((probe && probe.text) || "");
  if (!/sesskey|logout\.php|Déconnexion/i.test(html)) {
    throw new Error("Connexion WebView non confirmée — réessaie en restant connecté.");
  }
  return wv;
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

/** Découpe la page de cours en sections + activités. */
function parseCourseHtml(html) {
  const src = String(html || "");
  const marks = [];
  const secRe = /id="section-(\d+)"/gi;
  let m;
  while ((m = secRe.exec(src))) marks.push({ index: Number(m[1]), at: m.index });

  const chunks = [];
  if (!marks.length) {
    chunks.push({ index: 0, name: "", html: src });
  } else {
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].at;
      const end = i + 1 < marks.length ? marks[i + 1].at : src.length;
      chunks.push({ index: marks[i].index, name: "", html: src.slice(start, end) });
    }
  }

  const sections = [];
  for (const c of chunks) {
    let name = "";
    let h = /<h3[^>]*class="[^"]*sectionname[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(c.html) ||
            /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(c.html);
    if (h) name = stripTags(h[1]);
    if (!name) {
      const al = /aria-label="([^"]+)"/i.exec(c.html);
      if (al) name = decodeEntities(al[1]);
    }
    const modules = [];
    const seen = {};
    const aRe = /<a[^>]+href="([^"]*\/mod\/([a-z0-9_]+)\/view\.php\?id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = aRe.exec(c.html))) {
      const id = a[3];
      if (seen[id]) continue;
      // On retire d'abord les libellés « accesshide » (« Fichier », « URL »…)
      // sinon ils se retrouvent collés au nom de l'activité.
      let label = a[4].replace(/<span[^>]*class="[^"]*accesshide[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
      const inst = /class="[^"]*instancename[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(label);
      if (inst) label = inst[1];
      label = stripTags(label);
      if (!label) continue;
      seen[id] = true;
      modules.push({ id, modname: a[2], name: label, url: absolutize(a[1], BASE) });
    }
    const inlineFiles = extractPluginfileUrls(c.html, BASE);
    if (modules.length || inlineFiles.length || name) {
      sections.push({ index: c.index, name, modules, inlineFiles, html: c.html });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
//  Synchronisation — mode service web (API REST)
// ---------------------------------------------------------------------------
async function courseNameWS(token, courseId) {
  const r = await safe(
    () => wsCall(token, "core_course_get_courses_by_field", { field: "id", value: courseId }),
    null
  );
  const c = r && r.courses && r.courses[0];
  if (!c) return `cours-${courseId}`;
  return c.fullname || c.shortname || `cours-${courseId}`;
}

async function syncCourseWS(token, courseId, courseName) {
  const name = courseName || (await courseNameWS(token, courseId));
  const courseDir = ensureDir(fm.joinPath(ROOT, sanitize(`${courseId} - ${name}`, `cours-${courseId}`)));
  log(`\n📚 ${name}  (id ${courseId})`);

  const sections = await wsCall(token, "core_course_get_contents", { courseid: courseId });
  if (!Array.isArray(sections)) throw new Error("Contenu du cours illisible.");

  const links = [];
  const index = [`# ${name}`, "", `Source : ${BASE}/course/view.php?id=${courseId}`, ""];

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const num = typeof sec.section === "number" ? sec.section : s;
    const secName = sanitize(`${pad2(num)} - ${stripTags(sec.name) || "Section"}`, `section-${num}`);
    const secDir = fm.joinPath(courseDir, secName);
    log(`  📂 ${secName}`);
    index.push(`\n## ${stripTags(sec.name) || `Section ${num}`}`);

    const modules = Array.isArray(sec.modules) ? sec.modules : [];
    for (const mod of modules) {
      const modName = stripTags(mod.name) || mod.modname;
      const contents = Array.isArray(mod.contents) ? mod.contents : [];
      const files = contents.filter((c) => c.type === "file" && c.fileurl);
      const urls = contents.filter((c) => c.type === "url" && c.fileurl);

      index.push(`- **${modName}** _(${mod.modname})_${mod.url ? ` — ${mod.url}` : ""}`);

      if (mod.modname === "label") continue;

      // Liens externes (mod/url, ou ressources de type lien)
      for (const u of urls) {
        writeLink(secDir, modName, u.fileurl, links);
        log(`      ↗︎ ${modName}`);
      }

      if (!files.length) {
        // Pas de fichier exposé : on garde au moins le lien vers l'activité.
        if (mod.url && !urls.length && mod.modname !== "url") {
          writeLink(fm.joinPath(secDir, "_activités"), modName, mod.url, null);
        }
        continue;
      }

      // Un module à plusieurs fichiers (dossier, page avec images) => sous-dossier
      const multi = files.length > 1;
      const targetDir = multi ? fm.joinPath(secDir, sanitize(modName, `module-${mod.id}`)) : secDir;

      for (const f of files) {
        const sub = String(f.filepath || "/").replace(/^\/+|\/+$/g, "");
        const dir = sub ? fm.joinPath(targetDir, sanitize(sub.replace(/\//g, " - "), "")) : targetDir;
        let fname = f.filename || filenameFromUrl(f.fileurl, modName);
        if (!multi && /^index\.html?$/i.test(fname)) fname = `${sanitize(modName, "page")}.html`;
        else if (!multi && files.length === 1 && fname && !/\./.test(fname)) fname = sanitize(modName, fname);
        const url = withParams(f.fileurl, { token, forcedownload: 1 });
        await safe(
          () =>
            saveFile(NetClient, dir, fname, url, {
              key: `${courseId}:${mod.id}:${f.filepath || "/"}${f.filename || fname}`,
              size: Number(f.filesize || 0),
              time: Number(f.timemodified || 0),
            }),
          null
        );
      }
    }
  }

  finishCourse(courseDir, name, links, index);
}

// ---------------------------------------------------------------------------
//  Synchronisation — mode HTML (session web ou WebView)
// ---------------------------------------------------------------------------
async function syncCourseHTML(client, courseId) {
  const res = await client.fetch(`${BASE}/course/view.php?id=${courseId}`);
  const html = String(res.text || "");
  if (!html || /login\/index\.php/i.test(html) && /loginform|loginbtn/i.test(html)) {
    throw new Error(`Cours ${courseId} inaccessible (session perdue ou droits insuffisants).`);
  }

  let name = "";
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (t) name = stripTags(t[1]).replace(/\s*[|:]\s*.*$/, "").trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && stripTags(h1[1])) name = stripTags(h1[1]);
  if (!name) name = `cours-${courseId}`;

  const courseDir = ensureDir(fm.joinPath(ROOT, sanitize(`${courseId} - ${name}`, `cours-${courseId}`)));
  log(`\n📚 ${name}  (id ${courseId})`);

  const sections = parseCourseHtml(html);
  const links = [];
  const index = [`# ${name}`, "", `Source : ${BASE}/course/view.php?id=${courseId}`, ""];

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const secLabel = sec.name || `Section ${sec.index}`;
    const secDir = fm.joinPath(courseDir, sanitize(`${pad2(sec.index)} - ${secLabel}`, `section-${sec.index}`));
    log(`  📂 ${secLabel}`);
    index.push(`\n## ${secLabel}`);

    for (const f of sec.inlineFiles) {
      await safe(
        () =>
          saveFile(client, secDir, filenameFromUrl(f, "fichier"), f, {
            key: `${courseId}:inline:${f}`,
          }),
        null
      );
    }

    for (const mod of sec.modules) {
      index.push(`- **${mod.name}** _(${mod.modname})_ — ${mod.url}`);
      await safe(() => handleModuleHTML(client, mod, secDir, courseId, links), null);
    }
  }

  finishCourse(courseDir, name, links, index);
}

async function handleModuleHTML(client, mod, secDir, courseId, links) {
  const modLabel = mod.name || mod.modname;

  // 1. Liens externes : on demande à Moodle de ne pas rediriger.
  if (mod.modname === "url") {
    let target = "";
    const page = await safe(() => client.fetch(withParams(mod.url, { redirect: 0 })), null);
    const pageHtml = String((page && page.text) || "");
    if (pageHtml) {
      const w = /<div[^>]*class="[^"]*urlworkaround[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i.exec(pageHtml) ||
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
      await saveFile(client, secDir, filenameFromUrl(target, modLabel), target, {
        key: `${courseId}:${mod.id}:url-file`,
      });
    } else {
      writeLink(secDir, modLabel, target, links);
      log(`      ↗︎ ${modLabel}`);
    }
    return;
  }

  // 2. Pages / livres : on enregistre le contenu en HTML lisible hors-ligne.
  if (mod.modname === "page" || mod.modname === "book") {
    const page = await client.fetch(mod.url);
    const pageHtml = String(page.text || "");
    if (!pageHtml) return;
    savePage(secDir, modLabel, pageHtml, mod.url);
    await downloadAssets(client, pageHtml, mod, secDir, courseId, links);

    if (mod.modname === "book") {
      const chapRe = /href="([^"]*\/mod\/book\/view\.php\?id=\d+(?:&amp;|&)chapterid=(\d+)[^"]*)"/gi;
      const done = {};
      let c;
      while ((c = chapRe.exec(pageHtml))) {
        if (done[c[2]]) continue;
        done[c[2]] = true;
        const url = absolutize(c[1], mod.url);
        const chap = await safe(() => client.fetch(url), null);
        const chtml = String((chap && chap.text) || "");
        if (!chtml) continue;
        let title = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(chtml);
        const chapName = `${modLabel} - ${stripTags(title ? title[1] : "") || `chapitre ${c[2]}`}`;
        savePage(fm.joinPath(secDir, sanitize(modLabel, "livre")), chapName, chtml, url);
        await downloadAssets(client, chtml, mod, fm.joinPath(secDir, sanitize(modLabel, "livre")), courseId, links);
      }
    }
    return;
  }

  // 3. Cas général (ressource, dossier, devoir, glossaire…) :
  //    on ouvre l'activité et on récupère tout ce qui ressemble à un fichier.
  const res = await client.fetch(mod.url);

  // La page a directement renvoyé le fichier (redirection Moodle vers pluginfile).
  if (!res.text && res.data) {
    const nameFromHeader = filenameFromDisposition(res.disposition);
    const fname = nameFromHeader || filenameFromUrl(res.finalUrl, modLabel);
    const path = uniquePath(ensureDir(secDir), sanitize(fname, modLabel), `${courseId}:${mod.id}:direct`);
    if (!CONFIG.overwrite && fm.fileExists(path) && manifest[`${courseId}:${mod.id}:direct`]) {
      stats.skipped++;
      log(`      = ${fm.fileName(path, true)}`);
      return;
    }
    fm.write(path, res.data);
    const written = Math.round((fm.fileSize(path) || 0) * 1024);
    manifest[`${courseId}:${mod.id}:direct`] = { path, size: res.size || written, time: 0 };
    stats.files++;
    stats.bytes += res.size || written;
    log(`      ↓ ${fm.fileName(path, true)} (${humanSize(res.size || written)})`);
    return;
  }

  const pageHtml = String(res.text || "");
  if (!pageHtml) return;

  const files = extractPluginfileUrls(pageHtml, mod.url);
  const multi = files.length > 1;
  const dir = multi ? fm.joinPath(secDir, sanitize(modLabel, `module-${mod.id}`)) : secDir;
  for (const f of files) {
    await safe(
      () =>
        saveFile(client, dir, filenameFromUrl(f, modLabel), f, {
          key: `${courseId}:${mod.id}:${f}`,
        }),
      null
    );
  }

  for (const e of extractEmbeds(pageHtml, mod.url)) {
    writeLink(dir, `${modLabel} - média`, e, links);
    log(`      ↗︎ média intégré : ${e}`);
  }

  if (!files.length && !mod.url.includes("/mod/label/")) {
    writeLink(fm.joinPath(secDir, "_activités"), modLabel, mod.url, null);
  }
}

/** Images/fichiers référencés dans une page + médias intégrés. */
async function downloadAssets(client, html, mod, dir, courseId, links) {
  const assetsDir = fm.joinPath(dir, sanitize(`${mod.name} - fichiers`, "fichiers"));
  const files = extractPluginfileUrls(html, mod.url);
  for (const f of files) {
    await safe(
      () =>
        saveFile(client, assetsDir, filenameFromUrl(f, "fichier"), f, {
          key: `${courseId}:${mod.id}:${f}`,
        }),
      null
    );
  }
  for (const e of extractEmbeds(html, mod.url)) {
    writeLink(assetsDir, `${mod.name} - média`, e, links);
  }
}

/** Écrit LIENS.md et INDEX.md à la fin d'un cours. */
function finishCourse(courseDir, name, links, index) {
  if (CONFIG.saveLinks && links.length) {
    const md = [`# Liens externes — ${name}`, ""]
      .concat(links.map((l) => `- [${l.name}](${l.url})`))
      .join("\n");
    try { fm.writeString(fm.joinPath(courseDir, "LIENS.md"), md + "\n"); }
    catch (e) { fail("LIENS.md : " + e); }
  }
  if (CONFIG.saveIndex) {
    try { fm.writeString(fm.joinPath(courseDir, "INDEX.md"), index.join("\n") + "\n"); }
    catch (e) { fail("INDEX.md : " + e); }
  }
}

// ---------------------------------------------------------------------------
//  Orchestration
// ---------------------------------------------------------------------------
function forgetCredentials() {
  for (const k of Object.keys(KC)) {
    const key = KC[k];
    if (Keychain.contains(key)) Keychain.remove(key);
  }
  log("Identifiants et jeton oubliés.");
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

/** Choisit et établit le mode de connexion. Retourne {mode, token, client}. */
async function connect() {
  // a) jeton déjà mémorisé
  let token = Keychain.contains(KC.token) ? Keychain.get(KC.token) : null;
  if (token) {
    const info = await validateToken(token);
    if (info) {
      log(`✓ Service web : connecté en tant que ${info.username} (${info.sitename || ORIGIN})`);
      return { mode: "ws", token, client: NetClient, info };
    }
    Keychain.remove(KC.token);
    warn("Jeton mémorisé expiré.");
  }

  // b) identifiants mémorisés
  if (Keychain.contains(KC.user) && Keychain.contains(KC.pass)) {
    const user = Keychain.get(KC.user);
    const pass = Keychain.get(KC.pass);
    const t = await safe(() => tokenFromCredentials(user, pass), null);
    if (t && (await validateToken(t))) {
      Keychain.set(KC.token, t);
      log("✓ Service web : jeton obtenu avec les identifiants mémorisés.");
      return { mode: "ws", token: t, client: NetClient };
    }
    const ok = await safe(() => webLogin(user, pass), false);
    if (ok) {
      log("✓ Session web ouverte avec les identifiants mémorisés.");
      return { mode: "web", token: null, client: NetClient };
    }
    warn("Les identifiants mémorisés ne fonctionnent plus.");
  }

  if (!config.runsInApp) {
    throw new Error(
      "Aucune connexion valide mémorisée. Lance le script une fois depuis l'app Scriptable pour t'authentifier."
    );
  }

  // c) choix interactif
  const menu = new Alert();
  menu.title = "Connexion à Moodle STRI";
  menu.message = "Comment veux-tu te connecter ?";
  menu.addAction("Identifiant + mot de passe");
  menu.addAction("Connexion navigateur (SSO / CAS)");
  menu.addAction("Coller un lien moodlemobile://");
  menu.addCancelAction("Annuler");
  const choice = await menu.presentAlert();
  if (choice === -1) throw new Error("Connexion annulée.");

  if (choice === 0) {
    const creds = await askCredentials();
    if (!creds) throw new Error("Connexion annulée.");
    const t = await safe(() => tokenFromCredentials(creds.user, creds.pass), null);
    if (t && (await validateToken(t))) {
      Keychain.set(KC.token, t);
      log("✓ Service web : jeton obtenu.");
      return { mode: "ws", token: t, client: NetClient };
    }
    warn("Service web indisponible — bascule sur la session web classique.");
    await webLogin(creds.user, creds.pass);
    log("✓ Session web ouverte.");
    return { mode: "web", token: null, client: NetClient };
  }

  if (choice === 1) {
    const wv = await webViewLogin();
    log("✓ Session ouverte dans la WebView.");
    // Bonus : si la page « Clés de sécurité » expose un jeton, on passe en mode API.
    const t = await safe(() => tokenFromManageTokenPage(WebViewClient), null);
    if (t && (await validateToken(t))) {
      Keychain.set(KC.token, t);
      log("✓ Jeton de service web récupéré : mode API activé (plus rapide).");
      return { mode: "ws", token: t, client: NetClient };
    }
    return { mode: "wv", token: null, client: WebViewClient, wv };
  }

  // choice === 2 : jeton SSO collé depuis le lien moodlemobile://
  const a = new Alert();
  a.title = "Lien moodlemobile://";
  a.message =
    "1) Ouvre dans Safari :\n" +
    `${BASE}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=1&urlscheme=moodlemobile\n` +
    "2) Connecte-toi (SSO compris)\n" +
    "3) Copie le lien « moodlemobile://token=... » et colle-le ici.";
  a.addTextField("moodlemobile://token=…", Pasteboard.paste() || "");
  a.addAction("Valider");
  a.addCancelAction("Annuler");
  const r = await a.presentAlert();
  if (r === -1) throw new Error("Connexion annulée.");
  const t = tokenFromLaunchUrl(a.textFieldValue(0));
  if (!(await validateToken(t))) throw new Error("Jeton refusé par le site.");
  Keychain.set(KC.token, t);
  log("✓ Jeton SSO validé.");
  return { mode: "ws", token: t, client: NetClient };
}

async function listMyCoursesWS(token, info) {
  const userid = info && info.userid ? info.userid : (await validateToken(token) || {}).userid;
  if (!userid) return [];
  const courses = await safe(() => wsCall(token, "core_enrol_get_users_courses", { userid }), []);
  return (courses || []).map((c) => ({ id: c.id, name: c.fullname || c.shortname }));
}

function summary(started) {
  const secs = Math.round((Date.now() - started) / 1000);
  const lines = [
    "",
    "──────────── Résumé ────────────",
    `Fichiers téléchargés : ${stats.files} (${humanSize(stats.bytes)})`,
    `Déjà à jour          : ${stats.skipped}`,
    `Pages enregistrées   : ${stats.pages}`,
    `Liens externes       : ${stats.links}`,
    `Erreurs              : ${stats.errors.length}`,
    `Durée                : ${secs}s`,
    `Dossier              : Fichiers ▸ ${CONFIG.useICloud ? "iCloud Drive" : "Sur mon iPhone"} ▸ Scriptable ▸ ${CONFIG.rootFolderName}`,
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
  if (CONFIG.resetCredentials) forgetCredentials();

  ensureDir(ROOT);
  await loadManifest();

  const auth = await connect();
  let targets = resolveCourseIds().map((id) => ({ id, name: null }));

  if (auth.mode === "ws" && CONFIG.allMyCourses) {
    const mine = await listMyCoursesWS(auth.token, auth.info);
    if (mine.length) targets = mine;
  }
  if (!targets.length) throw new Error("Aucun identifiant de cours à traiter (CONFIG.courseIds).");

  log(`Mode : ${auth.mode} — ${targets.length} cours à synchroniser.`);

  for (const t of targets) {
    try {
      if (auth.mode === "ws") await syncCourseWS(auth.token, t.id, t.name);
      else await syncCourseHTML(auth.client, t.id);
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
    done.addCancelAction("Fermer");
    if ((await done.presentAlert()) === 0) {
      Safari.open(`shareddocuments://${ROOT}`);
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
