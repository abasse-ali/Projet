# MoodleSTRI — Rendre les fichiers accessibles sans iCloud

Les 50 fichiers sont bien téléchargés. Ils sont dans le conteneur privé de
Scriptable, que Fichiers n'affiche pas dans « Sur mon iPhone ». Voici les
4 correctifs à appliquer au script.

---

## Étape préalable : créer le signet (une seule fois)

1. **Fichiers** → `Sur mon iPhone` → `Downloads` → bouton `…` → **Nouveau dossier**
   → nommez-le `Moodle STRI`.
2. **Scriptable** → engrenage ⚙️ (en haut à gauche) → **File Bookmarks** → `+`
3. Choisissez **Pick Folder**, sélectionnez le dossier créé à l'étape 1.
4. Nommez le signet exactement : `MoodleSTRI`

Le script pourra alors écrire directement dans un dossier visible de Fichiers,
en local, sans iCloud.

---

## Correctif 1 — CONFIG : ajouter le signet

Dans le bloc `// --- Stockage ---`, ajoutez la ligne `bookmarkName` :

```js
  // --- Stockage ------------------------------------------------------------
  rootFolderName: "Moodle STRI",  // dossier créé dans Scriptable (Fichiers)
  useICloud: false,               // false = « Sur mon iPhone » ; true = iCloud Drive
  bookmarkName: "MoodleSTRI",     // signet Scriptable (⚙️ ▸ File Bookmarks). "" = conteneur Scriptable
  overwrite: false,               // true = re-télécharge tout à chaque fois
```

---

## Correctif 2 — Résoudre ROOT via le signet

Remplacez la ligne :

```js
const ROOT = fm.joinPath(fm.documentsDirectory(), CONFIG.rootFolderName);
```

par :

```js
/**
 * Emplacement racine.
 * Un signet Scriptable (⚙️ ▸ File Bookmarks) permet d'écrire dans un dossier
 * normal de l'app Fichiers, donc visible sans iCloud. Sans signet valide, on
 * retombe sur le conteneur de Scriptable.
 */
const ROOT = (() => {
  const name = String(CONFIG.bookmarkName || "").trim();
  if (name) {
    try {
      const base = fm.bookmarkedPath(name);
      if (base) return fm.joinPath(base, CONFIG.rootFolderName);
    } catch (e) {
      warn(`Signet « ${name} » introuvable — écriture dans le dossier Scriptable.`);
    }
  }
  return fm.joinPath(fm.documentsDirectory(), CONFIG.rootFolderName);
})();
```

---

## Correctif 3 — Réparer « Ouvrir le dossier »

`ROOT` contient une espace (`Moodle STRI`). Sans encodage, l'URL
`shareddocuments://` est invalide et Safari l'ignore **silencieusement** :
c'est pour ça que le bouton ne faisait rien.

Dans `main()`, remplacez tout le bloc `if (config.runsInApp) { ... }` par :

```js
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
      // encodeURI : indispensable, le chemin contient des espaces.
      Safari.open("shareddocuments://" + encodeURI(ROOT));
    } else if (choice === 1) {
      // Filet de sécurité : copie le dossier où l'utilisateur veut.
      await safe(() => DocumentPicker.export(ROOT), null);
    } else if (choice === 2) {
      Pasteboard.copy(ROOT);
    }
  }
```

---

## Correctif 4 — Afficher le vrai chemin

Le résumé annonce un chemin codé en dur qui devient faux avec le signet.
Dans `summary()`, remplacez la dernière ligne du tableau `lines` :

```js
    `Dossier              : Fichiers ▸ ${CONFIG.useICloud ? "iCloud Drive" : "Sur mon iPhone"} ▸ Scriptable ▸ ${CONFIG.rootFolderName}`,
```

par :

```js
    `Dossier              : ${ROOT}`,
```

Et dans `main()`, juste après `ensureDir(ROOT);`, ajoutez :

```js
  log(`Destination : ${ROOT}`);
```

---

## Retrouver les 50 fichiers déjà téléchargés

Ils sont toujours là, dans l'ancien emplacement. Deux façons :

**Immédiate** — créez un script Scriptable jetable :

```js
const fm = FileManager.local();
const root = fm.joinPath(fm.documentsDirectory(), "Moodle STRI");
console.log("Chemin : " + root);
console.log("Existe : " + fm.fileExists(root));
console.log(fm.listContents(root).join("\n"));
Safari.open("shareddocuments://" + encodeURI(root));
```

**Ou** via la recherche de Fichiers : tapez `INDEX.md`.

---

## Après les correctifs

Au premier lancement, `_manifest.json` se trouve dans le nouveau dossier (donc
vide) : les 50 fichiers seront re-téléchargés une fois, en 44 s environ. Les
exécutions suivantes repasseront en « déjà à jour ».

Vous pouvez ensuite supprimer l'ancien dossier via le script jetable ci-dessus.

---

## Si le signet ne fonctionne pas

Laissez `bookmarkName: ""`. Le script écrit alors dans le conteneur Scriptable,
et les correctifs 3 et 4 suffisent : le bouton **Ouvrir le dossier** y mène
directement, et **Exporter vers Fichiers** copie tout où vous voulez.
