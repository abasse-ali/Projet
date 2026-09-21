# MoodleSTRI — Correction de l'action « Exécuter du JavaScript sur une page web »

Erreur : `Failed evaluating JavaScript with error: JavaScript execution returned
a result of an unsupported type`

---

## Ce que l'erreur signifie exactement

L'action Raccourcis fournit une fonction globale `completion()`. Elle n'accepte que :

| Accepté | Refusé (→ erreur) |
|---|---|
| chaîne de caractères | `undefined` (aucun `completion()` appelé) |
| nombre | `null` |
| booléen | élément DOM (`document.querySelector(...)`) |
| tableau de ces types | `NodeList` (`document.querySelectorAll(...)`) |
| dictionnaire de ces types | `Promise` (code `async` / `fetch`) |
| | objet contenant des fonctions |

**Les deux causes qui représentent 90 % des cas :**

1. `completion(document.querySelectorAll('a'))` → c'est une `NodeList`, pas un tableau.
2. Un chemin de code sort sans appeler `completion()` (un `if` qui ne matche rien,
   une exception avalée) → la valeur rendue est `undefined`.

**La parade universelle :** ne jamais renvoyer autre chose qu'une **chaîne JSON**.
`completion(JSON.stringify(...))` ne peut structurellement pas produire cette erreur.

---

## Prérequis à vérifier une seule fois

`Réglages` → `Raccourcis` → `Avancé` → **Autoriser l'exécution de scripts** : activé.
Sans ça, l'action échoue aussi (message différent, mais autant le vérifier maintenant).

---

## Le JavaScript corrigé (à coller tel quel)

Remplace intégralement le contenu de votre action « Exécuter du JavaScript sur une page web ».

```javascript
/* MoodleSTRI — extraction des fichiers du tableau de bord
   Renvoie TOUJOURS une chaîne JSON : jamais d'erreur de type. */
(function () {

  // Un seul point de sortie, toujours une chaîne.
  var fini = false;
  function done(payload) {
    if (fini) return;
    fini = true;
    try {
      completion(JSON.stringify(payload));
    } catch (e) {
      completion('{"ok":false,"erreur":"serialisation_impossible"}');
    }
  }

  // Filet de sécurité : si quoi que ce soit bloque, on sort quand même.
  setTimeout(function () {
    done({ ok: false, erreur: "timeout", url: location.href });
  }, 8000);

  try {
    // 1. Sommes-nous vraiment connectés ?
    var connecte = !!document.querySelector('a[href*="/login/logout.php"]')
                || /"sesskey":"/.test(document.documentElement.innerHTML);

    if (!connecte) {
      return done({
        ok: false,
        erreur: "non_connecte",
        url: location.href,
        titre: document.title
      });
    }

    // 2. Récupérer la sesskey (utile pour les requêtes suivantes)
    var sesskey = "";
    var m = document.documentElement.innerHTML.match(/"sesskey"\s*:\s*"(\w+)"/);
    if (m) { sesskey = m[1]; }

    // 3. Collecter les liens de fichiers et de ressources
    var selecteurs = [
      'a[href*="/mod/resource/view.php"]',
      'a[href*="/mod/folder/view.php"]',
      'a[href*="/mod/url/view.php"]',
      'a[href*="/mod/assign/view.php"]',
      'a[href*="/pluginfile.php"]',
      'a[href*="/course/view.php"]'
    ].join(",");

    // ⚠️ Array.prototype.slice.call() : c'est CE convertisseur qui manquait.
    var liens = Array.prototype.slice.call(document.querySelectorAll(selecteurs));

    var vus = {};
    var items = [];

    liens.forEach(function (a) {
      var url = String(a.href || "");
      if (!url || vus[url]) { return; }
      vus[url] = 1;

      var etiquette = a.querySelector(".instancename") || a;
      var nom = String(etiquette.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim();

      // Moodle ajoute le type d'activité en texte masqué : on le retire.
      nom = nom.replace(/\s*(Fichier|Dossier|URL|Devoir|File|Folder|Assignment)$/i, "").trim();

      if (!nom) { return; }

      var type = "autre";
      if (url.indexOf("/mod/resource/") > -1)   { type = "fichier"; }
      else if (url.indexOf("/mod/folder/") > -1) { type = "dossier"; }
      else if (url.indexOf("/pluginfile.php") > -1) { type = "direct"; }
      else if (url.indexOf("/mod/assign/") > -1) { type = "devoir"; }
      else if (url.indexOf("/course/view.php") > -1) { type = "cours"; }

      items.push({ nom: nom, url: url, type: type });
    });

    return done({
      ok: true,
      hote: location.host,
      sesskey: sesskey,
      total: items.length,
      elements: items
    });

  } catch (e) {
    return done({
      ok: false,
      erreur: String((e && e.message) ? e.message : e),
      url: location.href
    });
  }

})();
```

### Ce qui a été corrigé, ligne par ligne

| Problème | Correction |
|---|---|
| `NodeList` renvoyée telle quelle | `Array.prototype.slice.call(...)` avant le `.map()` |
| Chemins de code sans `completion()` | Un seul `done()`, appelé sur **toutes** les branches |
| Exception silencieuse → `undefined` | `try/catch` global qui renvoie l'erreur en JSON |
| Blocage infini (page pas prête) | `setTimeout` de 8 s qui sort proprement |
| Double appel de `completion()` | Garde-fou `fini` |
| Type imprévisible | `JSON.stringify()` systématique |

---

## Le câblage dans Raccourcis, juste après

```
[Afficher la page web]  → https://VOTRE-MOODLE/my/
      ↓  (l'utilisateur se connecte, puis appuie sur Terminé)
[Exécuter du JavaScript sur une page web]   ← le script ci-dessus
      ↓
[Obtenir le dictionnaire de l'entrée]        ← convertit le JSON en dictionnaire
      ↓
[Obtenir la valeur du dictionnaire] → Clé : ok            [Variable : OK]
      ↓
Si  [OK]  est  faux (0)
  ├ [Obtenir la valeur du dictionnaire] → Clé : erreur    [Variable : ERR]
  ├ [Afficher l'alerte] → "Échec : [ERR]"
  └ [Arrêter le raccourci]
Sinon
  ├ [Obtenir la valeur du dictionnaire] → Clé : elements  [Variable : ELEMENTS]
  ├ [Répéter pour chaque] → [ELEMENTS]
  │    ├ [Obtenir la valeur du dictionnaire] → Clé : url   (dans Élément de répétition)
  │    ├ [Obtenir le contenu de l'URL]        (GET)
  │    └ [Enregistrer le fichier]
  └ [Afficher la notification] → "[nombre d'éléments] fichiers récupérés"
```

**Point important :** l'action `Obtenir le dictionnaire de l'entrée` est indispensable.
Sans elle, vous manipulez une chaîne de texte et toutes les actions
`Obtenir la valeur du dictionnaire` renverront vide.

---

## Si ça échoue encore

Insérez un **`Coup d'œil`** directement après l'action JavaScript, avant
`Obtenir le dictionnaire de l'entrée`. Vous verrez le JSON brut :

- `{"ok":false,"erreur":"non_connecte", ...}`
  → la session n'a pas survécu à la fermeture de la fenêtre. Utilisez `/my/` comme URL
    de départ plutôt que la page d'accueil, et ne fermez la fenêtre qu'une fois
    le tableau de bord réellement affiché.
- `{"ok":true,"total":0, ...}`
  → connecté, mais aucun lien trouvé : vos sélecteurs ne correspondent pas à ce thème
    Moodle. Lancez le script depuis une page de **cours** et non le tableau de bord.
- `{"ok":false,"erreur":"timeout"}`
  → la page n'était pas finie de charger. Ajoutez `Attendre 2 secondes` avant l'action JS.
- Rien du tout / même erreur de type
  → `Réglages` → `Raccourcis` → `Avancé` → `Autoriser l'exécution de scripts` désactivé.

---

## Règle générale à retenir

Dans « Exécuter du JavaScript sur une page web », ne renvoyez **jamais** un objet du DOM.
Terminez toujours par `completion(JSON.stringify(objetSimple))`, et faites en sorte que
chaque branche du code y passe. Cette erreur devient alors impossible.
