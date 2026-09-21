# Moodle STRI → app Fichiers (script Scriptable pour iPhone)

Télécharge le contenu d'un cours Moodle (`https://www.stri.fr/eformation`, cours **id=45** par
défaut) et le range dans l'app **Fichiers**, section par section : documents, vidéos, images,
pages Moodle converties en HTML lisible hors-ligne, et liens externes.

Relancer le script ne re-télécharge que ce qui a changé (un manifeste `_manifest.json` mémorise
taille et date de chaque fichier).

---

## 1. Installation

1. Installer **Scriptable** (gratuit, App Store).
2. Copier `MoodleSTRI.js` sur l'iPhone, au choix :
   - ouvrir le fichier sur GitHub → **Raw** → tout sélectionner → copier, puis dans Scriptable
     `+` (nouveau script) → coller ;
   - ou déposer `MoodleSTRI.js` dans **Fichiers ▸ iCloud Drive ▸ Scriptable** : il apparaît
     directement dans la liste des scripts.
3. Renommer le script « Moodle STRI » (appui long → *Rename*).

## 2. Première exécution

Lancer le script **depuis l'app Scriptable** (la première fois seulement : il faut pouvoir
répondre aux questions). Un menu propose trois méthodes de connexion :

| Choix | Quand l'utiliser | Ce qui se passe |
|---|---|---|
| **Identifiant + mot de passe** | Compte Moodle local (login/mot de passe saisis sur la page Moodle) | Tente d'obtenir un jeton de service web (`login/token.php`), sinon ouvre une session web classique |
| **Connexion navigateur (SSO / CAS)** | Connexion via le portail de l'université / ENT | Une fenêtre s'ouvre : tu te connectes normalement, tu fermes la fenêtre (*Terminé*), et le script réutilise cette session |
| **Coller un lien `moodlemobile://`** | SSO, pour obtenir un vrai jeton d'API (mode le plus rapide et le plus fiable) | Voir ci-dessous |

### Obtenir le lien `moodlemobile://` (optionnel mais recommandé)

1. Ouvrir dans Safari :
   `https://www.stri.fr/eformation/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=1&urlscheme=moodlemobile`
2. Se connecter (SSO compris).
3. Safari tente d'ouvrir `moodlemobile://token=...` : appui long sur le lien → **Copier**
   (ou, si l'app Moodle s'ouvre, copier l'adresse depuis l'historique Safari).
4. Choisir « Coller un lien `moodlemobile://` » dans le script et coller.

Identifiants et jeton sont stockés dans le **Trousseau iOS** (`Keychain`), jamais en clair dans
le script. Pour les oublier : passer `resetCredentials: true` en haut du fichier, lancer une fois,
puis remettre `false`.

## 3. Où arrivent les fichiers

```
Fichiers ▸ iCloud Drive ▸ Scriptable ▸ Moodle STRI
└── 45 - Nom du cours
    ├── INDEX.md              (plan du cours + lien de chaque activité)
    ├── LIENS.md              (tous les liens externes du cours)
    ├── 00 - Généralités
    │   ├── Plan de cours.pdf
    │   └── _activités/Annonces.url
    └── 01 - Séance 1 : IP
        ├── Rappels d'adressage.html      (page Moodle hors-ligne)
        ├── Vidéo YouTube.url             (lien externe)
        └── TD & corrigés/                (dossier Moodle → sous-dossier)
            ├── td1.pdf
            └── corrigé.docx
```

## 4. Réglages (bloc `CONFIG`, en haut du fichier)

| Option | Défaut | Rôle |
|---|---|---|
| `baseUrl` | `https://www.stri.fr/eformation` | Racine du Moodle |
| `courseIds` | `[45]` | Cours à récupérer, ex. `[45, 52]` |
| `allMyCourses` | `false` | `true` = tous les cours où tu es inscrit (mode API uniquement) |
| `rootFolderName` | `Moodle STRI` | Dossier de destination dans Scriptable |
| `useICloud` | `true` | `false` = stockage local (« Sur mon iPhone ») |
| `overwrite` | `false` | `true` = tout re-télécharger |
| `maxFileMB` | `0` | Ignorer les fichiers au-delà de N Mo (`0` = pas de limite) |
| `maxFileMBWebView` | `60` | Limite propre au mode SSO/WebView (transfert via pont JS) |
| `savePages` / `saveLinks` / `saveIndex` | `true` | Pages `.html`, raccourcis de liens, `INDEX.md` |
| `linkFileFormat` | `"url"` | `"url"`, `"html"` (ouvre direct dans Safari) ou `"webloc"` |
| `saveImagesToPhotos` | `false` | `true` = copie aussi les images dans l'app Photos |
| `notify` | `true` | Notification iOS de fin |

Depuis l'app **Raccourcis**, le script accepte aussi un paramètre : « Exécuter le script
Scriptable » avec le texte `45,52` remplace `courseIds`.

## 5. Automatiser

- **Raccourcis ▸ Automatisation ▸ Heure de la journée** → *Exécuter le script* « Moodle STRI ».
  En mode non interactif, le script réutilise le jeton / les identifiants mémorisés ; il ne
  demande jamais rien et notifie le résultat.
- Une sync quotidienne suffit : seuls les nouveaux fichiers sont téléchargés.

## 6. Limites connues et dépannage

- **« Aucune connexion valide mémorisée »** en automatisation : relancer une fois le script
  à la main depuis Scriptable pour ré-authentifier (jeton expiré ou mot de passe changé).
- **SSO/CAS** : `login/token.php` échoue presque toujours dans ce cas — utiliser le mode
  navigateur ou le lien `moodlemobile://`.
- **Vidéos hébergées ailleurs** (YouTube, Vimeo, Pod, Panopto…) : seul le **lien** est
  enregistré (`.url` + `LIENS.md`), le fichier n'est pas récupérable côté Moodle.
- **Gros fichiers en mode SSO/WebView** : transfert limité à `maxFileMBWebView` (60 Mo par
  défaut) car les données transitent par un pont JavaScript. Les modes API/web n'ont pas
  cette limite.
- **Activités sans fichier** (forum, test, devoir sans pièce jointe) : un raccourci vers
  l'activité est déposé dans `_activités/`.
- **Erreurs réseau** : chaque requête est retentée 3 fois avec attente progressive ; le résumé
  final liste les échecs restants.
- Le script ne récupère que ce à quoi **ton compte a déjà accès** : il ne contourne ni les
  clés d'inscription ni les restrictions d'accès. Les contenus restent soumis au droit d'auteur
  de leurs auteurs — usage personnel.
