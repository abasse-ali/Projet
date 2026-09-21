# MoodleSTRI — Bloc d'authentification corrigé (iOS Raccourcis)

Corrige : `logintoken` manquant, cookies, SSO/CAS, espaces invisibles,
encodage du mot de passe, et messages d'erreur aveugles.

---

## ÉTAPE 0 — Diagnostic (30 secondes, à faire en premier)

Créez un raccourci jetable avec **2 actions** :

1. `Obtenir le contenu de l'URL` → `https://VOTRE-MOODLE/login/index.php` (méthode GET)
2. `Coup d'œil` (Quick Look)

Lisez le HTML qui s'affiche et cherchez :

| Ce que vous voyez | Diagnostic | Allez au |
|---|---|---|
| `name="logintoken" value="..."` | Moodle local classique | **Flux A** ou **Flux B** |
| une redirection vers `cas.../cas/login`, ou `name="execution"` | SSO CAS | **Flux C** |
| `Ce site utilise des cookies` / page de politique | Politique non acceptée | Se connecter 1× dans Safari, puis Flux A/B |

---

## FLUX B — API token (LE PLUS SIMPLE, à essayer en premier)

Si les web services sont activés, 3 actions suffisent et rien ne casse.

```
1. Texte                     → VOTRE-MOODLE.fr          [Variable : BASE]
2. Texte                     → votre identifiant
3. Remplacer le texte        → Rechercher : \s   Remplacer : (vide)
                               ✅ Expression régulière   [Variable : USER]
4. Texte                     → votre mot de passe
5. Remplacer le texte        → Rechercher : ^\s+|\s+$   Remplacer : (vide)
                               ✅ Expression régulière   [Variable : PASS]

6. Obtenir le contenu de l'URL
   URL      : https://[BASE]/login/token.php
   Méthode  : POST
   Corps    : Formulaire          ← IMPORTANT (encode tout seul)
     username = [USER]
     password = [PASS]
     service  = moodle_mobile_app

7. Obtenir la valeur du dictionnaire → Clé : token         [Variable : TOKEN]

8. Si  [TOKEN]  n'a pas de valeur
     ├ Obtenir la valeur du dictionnaire → Clé : errorcode  [Variable : CODE]
     ├ Obtenir la valeur du dictionnaire → Clé : error      [Variable : MSG]
     ├ Afficher l'alerte → "Moodle a refusé : [CODE] — [MSG]"
     └ Arrêter le raccourci
   Sinon
     └ (suite de votre script, avec wstoken = [TOKEN])
```

### Lire le vrai code d'erreur (action 8)

| `errorcode` | Signification réelle | Ce qu'il faut faire |
|---|---|---|
| `invalidlogin` | Identifiants réellement refusés | Vérifier / compte verrouillé (voir plus bas) |
| `enablewsdescription` | Web services désactivés | Passer au **Flux A** |
| `servicenotavailable` | Service mobile non activé | Passer au **Flux A** |
| `sitepolicynotagreed` | Politique non acceptée | Se connecter 1× dans Safari |
| `usernotconfirmed` | Compte non confirmé | Contacter l'admin |
| *(redirection CAS)* | SSO | Passer au **Flux C** |

Appels suivants : `https://[BASE]/webservice/rest/server.php?wstoken=[TOKEN]&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`

---

## FLUX A — Formulaire web avec logintoken

À utiliser si le Flux B renvoie `enablewsdescription` ou `servicenotavailable`.

```
1-5. (identiques au Flux B : BASE, USER, PASS nettoyés)

6. Obtenir le contenu de l'URL
   URL     : https://[BASE]/login/index.php
   Méthode : GET
   ⚠️ Ne PAS mettre cette action dans un "Si" — elle doit poser le cookie MoodleSession

7. Faire correspondre le texte
   Expression : name="logintoken"\s+value="([a-f0-9]+)"
   Sur        : Contenu de l'URL (action 6)

8. Obtenir le groupe de la correspondance → Groupe 1        [Variable : LTOKEN]

9. Si [LTOKEN] n'a pas de valeur
     └ Afficher l'alerte → "Pas de logintoken : SSO/CAS probable → Flux C"
       Arrêter le raccourci

10. Obtenir le contenu de l'URL
    URL      : https://[BASE]/login/index.php
    Méthode  : POST
    En-têtes : Content-Type = application/x-www-form-urlencoded
    Corps    : Formulaire
      username   = [USER]
      password   = [PASS]
      logintoken = [LTOKEN]
      anchor     = (laisser vide)

11. Faire correspondre le texte
    Expression : "sesskey":"(\w+)"
    Sur        : Contenu de l'URL (action 10)

12. Obtenir le groupe de la correspondance → Groupe 1       [Variable : SESSKEY]

13. Si [SESSKEY] n'a pas de valeur
      ├ Faire correspondre le texte
      │   Expression : id="loginerrormessage"[^>]*>(.*?)</
      │   Sur : Contenu de l'URL (action 10)
      ├ Obtenir le groupe de la correspondance → Groupe 1   [Variable : ERR]
      ├ Afficher l'alerte → "Moodle : [ERR]"
      └ Arrêter le raccourci
    Sinon
      └ (suite du script — la session est ouverte, les requêtes suivantes passent)
```

### Points critiques du Flux A

- **Les actions 6 et 10 doivent être dans la même exécution** : Raccourcis partage le
  pot à cookies entre les actions `Obtenir le contenu de l'URL` d'un même run.
  Le `logintoken` n'est valable qu'avec le `MoodleSession` qui l'a émis.
- **Corps = Formulaire, jamais Texte brut.** En mode Formulaire, Raccourcis
  percent-encode automatiquement. En mode Texte, un `&` ou un `+` dans le mot de passe
  casse la requête silencieusement.
- Si Moodle est en anglais, l'action 13 cherchera `loginerrormessage` aussi — l'id est
  le même quelle que soit la langue.

---

## FLUX C — SSO / CAS (Université Toulouse & co.)

```
1-5. (identiques : BASE, USER, PASS nettoyés)

6. Texte → https://[BASE]/login/index.php
7. Encoder l'URL  (Encode)                                  [Variable : SERVICE]

8. Obtenir le contenu de l'URL
   URL     : https://VOTRE-CAS/cas/login?service=[SERVICE]
   Méthode : GET

9. Faire correspondre le texte
   Expression : name="execution"\s+value="([^"]+)"
10. Obtenir le groupe de la correspondance → Groupe 1       [Variable : EXEC]

11. Obtenir le contenu de l'URL
    URL      : https://VOTRE-CAS/cas/login?service=[SERVICE]
    Méthode  : POST
    Corps    : Formulaire
      username    = [USER]
      password    = [PASS]
      execution   = [EXEC]
      _eventId    = submit
      geolocation = (vide)

12. Faire correspondre le texte → "sesskey":"(\w+)"
13. Obtenir le groupe de la correspondance → Groupe 1       [Variable : SESSKEY]

14. Si [SESSKEY] n'a pas de valeur
      ├ Coup d'œil → Contenu de l'URL (action 11)   ← montre le vrai message CAS
      └ Arrêter le raccourci
    Sinon
      └ (suite du script)
```

L'URL du CAS se lit dans la barre d'adresse de Safari au moment où Moodle vous y redirige
(ex. `cas.univ-tlse3.fr`). Raccourcis suit les redirections tout seul, donc l'action 11
atterrit directement sur Moodle connecté.

---

## Compte verrouillé — à vérifier AVANT tout

Moodle bloque après **5 échecs** (`lockoutthreshold`), pour **30 minutes** par défaut.
Si vous avez relancé le raccourci une dizaine de fois, le bon mot de passe échoue
aussi en ce moment.

→ Connectez-vous une fois dans **Safari, en navigation privée**.
  - Ça marche → le compte va bien, le bug est dans le raccourci.
  - Ça échoue aussi → attendez 30 min, ou demandez un déblocage.

---

## Règle à garder

Ne jamais afficher un message d'erreur écrit à la main
(« Identifiant ou mot de passe refusé »). Affichez toujours **la réponse réelle de
Moodle** : `errorcode` en Flux B, `loginerrormessage` en Flux A, `Coup d'œil` en Flux C.
C'est ce qui vous fait gagner une heure la prochaine fois.

## Sécurité

Stockez identifiant et mot de passe dans des actions `Texte` du raccourci uniquement si
le téléphone est verrouillé par code/Face ID — un raccourci partagé exporte ses champs
texte en clair. Ne partagez jamais ce raccourci par lien iCloud sans vider ces champs
au préalable.
