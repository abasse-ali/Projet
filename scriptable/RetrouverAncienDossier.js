// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: folder-open;
//
// Retrouve les fichiers téléchargés AVANT le correctif de stockage, restés
// dans le conteneur interne de Scriptable (invisible depuis l'app Fichiers).
// Affiche le chemin, liste le contenu, et propose de tout exporter.

const FOLDER = "Moodle STRI";

const fm = FileManager.local();
const ancien = fm.joinPath(fm.documentsDirectory(), FOLDER);

console.log("Chemin  : " + ancien);
console.log("Existe  : " + fm.fileExists(ancien));

if (!fm.fileExists(ancien)) {
  const a = new Alert();
  a.title = "Rien à récupérer";
  a.message = "Aucun ancien dossier « " + FOLDER + " » dans le conteneur interne.";
  a.addCancelAction("Fermer");
  await a.presentAlert();
} else {
  const contenu = fm.listContents(ancien);
  console.log("Contenu :\n" + contenu.join("\n"));

  const a = new Alert();
  a.title = "Ancien dossier trouvé";
  a.message = contenu.length + " élément(s) :\n\n" + contenu.slice(0, 12).join("\n");
  a.addAction("Exporter vers Fichiers");
  a.addAction("Ouvrir dans Fichiers");
  a.addAction("Copier le chemin");
  a.addCancelAction("Fermer");

  const choix = await a.presentAlert();
  if (choix === 0) {
    await DocumentPicker.export(ancien);
  } else if (choix === 1) {
    Safari.open("shareddocuments://" + encodeURI(ancien));
  } else if (choix === 2) {
    Pasteboard.copy(ancien);
  }
}

Script.complete();
