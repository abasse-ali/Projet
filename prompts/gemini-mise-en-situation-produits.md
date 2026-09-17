# SUPER PROMPT GEMINI — Mise en situation multi-produits (rendu photo réel, sans logo/watermark)

> Cible : Gemini (Nano Banana / Gemini Image) en mode génération **avec images de référence**.
> Objectif : une photo d'intérieur crédible qui met en scène plusieurs produits du catalogue,
> avec une fidélité produit stricte et un rendu indiscernable d'une vraie photo.

---

## 0. Mode d'emploi (à faire AVANT de coller le prompt)

1. **Uploader 1 à 5 photos de référence** (une par produit, fond neutre de préférence).
2. Numéroter mentalement les images dans l'ordre d'upload : `[IMG 1]`, `[IMG 2]`, etc.
3. Coller le **BLOC A** (le méga-prompt) et remplacer les champs `{{ }}`.
4. Si un produit est déformé à la génération : relancer en ajoutant
   « conserve **strictement** la géométrie, les coutures et la texture de `[IMG n]`, ne redessine pas ce produit ».
5. Générer 3-4 variantes, garder la meilleure, puis affiner par **retouche conversationnelle**
   (« garde exactement cette image, change seulement la lumière pour une fin d'après-midi »).

---

## BLOC A — LE MÉGA-PROMPT (à copier-coller)

```
RÔLE
Tu es un photographe d'intérieur et de mobilier professionnel. Tu produis une photographie
publiée dans un catalogue de décoration haut de gamme. Le résultat doit être une PHOTOGRAPHIE
RÉELLE, pas une illustration, pas un rendu 3D, pas une image « stylisée IA ».

RÈGLE DE FIDÉLITÉ PRODUIT (priorité absolue)
Les images jointes sont la VÉRITÉ PRODUIT. Reproduis chaque produit à l'identique :
mêmes proportions, même géométrie, même couleur exacte, même texture de tissu, mêmes coutures,
mêmes piétements, même nombre de modules et de coussins. N'invente aucun détail, ne stylise pas,
n'ajoute ni n'enlève d'élément sur les produits. Seuls l'environnement, la lumière et l'angle
de prise de vue sont nouveaux.

PRODUITS À METTRE EN SCÈNE
- [IMG 1] {{produit 1 — ex. canapé modulaire en mousse, velours gris clair, assise en forme organique, 2 coussins lombaires}}
- [IMG 2] {{produit 2 — ex. lampadaire arc LED, arceau fin noir mat, ruban lumineux linéaire}}
- [IMG 3] {{produit 3 — ex. table basse industrielle, plateau bois brun vieilli, structure métal noir, double niveau}}
- [IMG 4] {{produit 4 — ex. panneaux muraux hexagonaux en bois de noyer à joints noirs}}
- [IMG 5] {{produit 5 — ex. mur végétal artificiel dense (fougères, lierre, feuillages panachés)}}

SCÈNE
Intérieur {{showroom contemporain / salon d'appartement haussmannien / loft}} réel et habité.
Sol en {{parquet chêne clair posé en lames droites}}, murs {{blanc cassé mat}}, plinthes fines.
Le mur du fond est habillé des panneaux [IMG 4] ; le mur latéral gauche porte le mur végétal [IMG 5].
Le canapé [IMG 1] est adossé au mur du fond, légèrement décentré vers la gauche.
La table basse [IMG 3] est placée devant, à {{45}} cm de l'assise, non parfaitement parallèle.
Le lampadaire [IMG 2] arrive depuis l'angle droit, son arc survolant l'accoudoir.
Espace crédible de {{22}} m², hauteur sous plafond {{2,70}} m.

COMPOSITION & CADRAGE
Plan large trois quarts, appareil à hauteur d'assise ({{110}} cm du sol), axe optique horizontal
(aucune contre-plongée, lignes verticales strictement droites). Le canapé occupe environ 60 % du cadre.
Règle des tiers, espace négatif à droite. Format {{16:9}}, résolution maximale.

APPAREIL & OPTIQUE (à simuler fidèlement)
Reflex plein format, objectif 35 mm, f/4.0, 1/125 s, ISO 320, mise au point sur l'assise centrale.
Profondeur de champ naturelle et modérée : arrière-plan très légèrement adouci, JAMAIS de bokeh
artificiel ni de flou crémeux. Légère aberration chromatique en bord de cadre, vignettage discret,
micro-perte de netteté dans les coins — comme une vraie optique.

LUMIÈRE
Source principale : lumière du jour indirecte entrant par une grande fenêtre hors-champ à gauche
(fin de matinée, ciel légèrement couvert). Température 5200 K, contraste doux.
Appoint : le lampadaire [IMG 2] allumé, halo chaud 2700 K sur l'accoudoir droit.
Ombres portées douces, directionnelles, COHÉRENTES entre tous les objets, avec ombres de contact
nettes et sombres là où chaque meuble touche le sol (aucun objet ne doit sembler flotter).
Aucune lumière parasite sans source visible, pas de « glow » irréel, pas de HDR agressif.

MATIÈRES & MICRO-DÉTAILS DE RÉALISME
- Tissu : fibres visibles, velouté avec variations de nap selon l'angle, plis d'usage naturels,
  légers creux d'assise, coussins non parfaitement alignés.
- Bois : veinage irrégulier, réflexions spéculaires atténuées, micro-rayures.
- Métal noir mat : reflets longs et diffus, pas de miroir.
- Sol : raccords de lames visibles, très légère poussière et micro-reflet de la fenêtre.
- Imperfections volontaires : une infime asymétrie de mise en place, un pli de textile,
  un câble de lampadaire visible et posé au sol de façon réaliste.

AMBIANCE
{{Chaleureuse, minimaliste, calme du matin. Aucune présence humaine, aucun animal.}}

POST-TRAITEMENT
Colorimétrie naturelle et neutre, blancs propres sans dominante, noirs légèrement levés,
grain argentique très fin et homogène, netteté modérée sans halos d'accentuation.
Rendu type photographie éditoriale non retouchée à l'excès.

INTERDITS STRICTS (aucune exception)
Aucun texte, aucun mot, aucun caractère, aucune typographie dans l'image.
Aucun logo, aucune marque, aucun filigrane, aucune signature, aucun tampon, aucun cartouche.
Aucun badge ou mention d'IA, aucune bordure, aucun cadre, aucune vignette de montage.
Aucun collage, aucune juxtaposition de plusieurs vues, une seule image unique et continue.
Aucun humain, aucune main, aucun reflet de personne dans une vitre.
Pas de rendu 3D, pas de CGI, pas de cartoon, pas de peinture, pas d'illustration.
Pas de perspective déformée, pas de fisheye, pas de lignes verticales fuyantes.
Pas de sur-saturation, pas de lumière néon irréaliste, pas de symétrie parfaite.
Pas de meubles supplémentaires non demandés, pas de duplication de produit,
pas de pieds/accoudoirs/coussins inventés.

CONTRÔLE FINAL
Avant de rendre l'image, vérifie : (1) chaque produit correspond exactement à sa référence,
(2) toutes les ombres viennent de la même direction, (3) les verticales sont droites,
(4) aucun texte ni logo n'est présent, (5) l'image pourrait passer pour une photo prise au reflex.
```

---

## BLOC B — VERSION PRÊTE À L'EMPLOI (catalogue mousse / décoration murale)

```
Photographie d'intérieur professionnelle, réelle, pour catalogue de décoration.
Les images jointes sont la vérité produit : reproduis chaque produit à l'identique
(proportions, couleur, texture, coutures, nombre de modules et de coussins). Ne stylise rien.

Scène : showroom contemporain lumineux de 25 m², parquet chêne clair, murs blanc cassé mat,
plafond 2,70 m, grande fenêtre hors-champ à gauche.

Mise en place :
- Mur du fond habillé de panneaux muraux hexagonaux en bois de noyer à joints noirs [IMG 4].
- Mur latéral gauche couvert d'un mur végétal artificiel dense [IMG 5], jusqu'à une verrière
  atelier en bois clair.
- Canapé d'angle modulable en velours côtelé crème à grosses côtes [IMG 1], adossé au mur du fond,
  méridienne à droite, coussins carrés assortis légèrement décalés.
- Table basse industrielle bois brun vieilli et métal noir, double plateau [IMG 3], devant le canapé,
  posée sans alignement parfait, un livre et une tasse en céramique mate dessus.
- Lampadaire arc LED noir mat [IMG 2] à droite, allumé, arc survolant la méridienne.

Prise de vue : reflex plein format, 35 mm, f/4, 1/125 s, ISO 320, appareil à 110 cm du sol,
axe horizontal, verticales parfaitement droites, plan large trois quarts, format 4:5.

Lumière : jour indirect 5200 K par la gauche, ciel voilé, contraste doux ;
appoint chaud 2700 K du lampadaire. Ombres cohérentes, ombres de contact nettes au sol,
aucun objet flottant.

Réalisme : fibres de velours côtelé visibles, plis d'usage, creux d'assise, veinage du bois
irrégulier, micro-poussière au sol, câble du lampadaire visible et réaliste, grain photo très fin,
légers vignettage et aberration chromatique d'optique.

Interdits : aucun texte, aucun logo, aucun filigrane, aucune signature, aucune mention d'IA,
aucune bordure ni cadre, aucun collage, aucune personne, pas de rendu 3D ni CGI,
pas de bokeh excessif, pas de HDR, pas de sur-saturation, pas de duplication de produit,
pas de mobilier ajouté.
```

---

## BLOC C — NÉGATIF UNIVERSEL (à ajouter si le rendu part en vrille)

```
Évite absolument : watermark, logo, texte, lettres, chiffres, signature, tampon, QR code,
bordure, cadre, split-screen, planche contact, rendu 3D, CGI, Unreal Engine, octane render,
cartoon, anime, peinture, aquarelle, HDR, over-sharpening, halos d'accentuation, sur-saturation,
peau plastique, symétrie parfaite, objets flottants, ombres incohérentes, doubles ombres,
reflets impossibles, perspective déformée, fisheye, verticales fuyantes, membres ou mains,
meubles dupliqués, pieds inventés, tissu lisse sans texture, éclairage néon, flare artificiel.
```

---

## BLOC D — VARIANTES RAPIDES (à greffer sur le BLOC A)

| Objectif | Ligne à ajouter |
|---|---|
| Ambiance soir | « Nuit tombée, fenêtre sombre, lampadaire comme source principale 2700 K, ambiance cosy et contrastée. » |
| Ambiance Instagram | « Format 4:5 vertical, cadrage plus serré, lumière naturelle chaude de fin d'après-midi rasante. » |
| Plan détail matière | « Macro 85 mm f/2.8 sur l'angle du canapé, profondeur de champ courte, texture du tissu au premier plan. » |
| Vue d'ensemble | « Plan très large 24 mm depuis l'angle opposé, toute la pièce visible, verticales corrigées. » |
| Fond neutre e-commerce | « Studio infini blanc cassé, ombre portée douce au sol, aucun décor, produit seul centré. » |
| Changement de coloris | « Garde exactement cette image, change uniquement la couleur du tissu du canapé en beige sable, conserve la texture et les ombres. » |

---

## BLOC E — ASTUCES QUI CHANGENT TOUT

1. **Une seule image de sortie** : dire explicitement « une seule image unique et continue »
   évite les planches/collages que Gemini produit spontanément avec plusieurs références.
2. **Itérer, ne pas relancer** : après une bonne génération, enchaîner en conversation
   (« garde cette image, déplace seulement la table basse de 20 cm vers la gauche »)
   plutôt que de régénérer de zéro — la cohérence produit se conserve beaucoup mieux.
3. **Le réalisme vient des défauts** : plis, poussière, câble visible, asymétrie légère,
   vignettage et grain. Un intérieur « parfait » se lit immédiatement comme généré.
4. **Ombres de contact** : c'est le détail n°1 qui trahit une image IA. Toujours l'exiger.
5. **Verticales droites** : préciser « axe optique horizontal, verticales strictement droites »
   supprime le look « photo de téléphone en contre-plongée ».
6. **Max 3-4 produits par image** : au-delà, la fidélité produit se dégrade nettement.
7. **Filigrane** : le prompt supprime tout logo ou texte *visible*. En revanche, Google appose
   un marquage invisible (SynthID) sur les images générées, qui n'est pas retirable par prompt —
   il n'affecte pas le rendu visuel. Selon la surface utilisée (application grand public vs API /
   AI Studio), un bandeau visible peut aussi être ajouté hors image : à vérifier côté sortie.
