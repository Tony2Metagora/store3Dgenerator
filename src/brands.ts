import type { MouleDef } from './moules';

/**
 * Prompt moule-aware, concis et directif.
 *
 * Deux images sont fournies à Gemini dans cet ordre :
 *  1. Le moule architectural Metagora (boutique 3D vide, adapté à la catégorie produit)
 *  2. La photo/visuel réel de la marque (pour les codes visuels)
 */
export function buildBrandPrompt(
  marque: string,
  description: string,
  moule?: MouleDef
): string {
  const m = marque || '[marque]';
  const d = description || '[produits]';
  const fixtures = moule?.fixtures || 'rayonnages et présentoirs adaptés aux produits';

  return `Transforme la boutique de l'image 1 (structure architecturale de référence) en boutique ${m}.

CONSIGNES STRICTES :
1. Conserve exactement : l'angle de vue, la profondeur, la forme des murs, les colonnes, la disposition du mobilier, l'éclairage au plafond, le sol. La structure reste identique.
2. Remplace TOUS les produits et supports de présentation (${fixtures}) par des étagères, vitrines ou tables adaptées aux ${d} de ${m}. Aucun produit ou mobilier d'origine ne doit subsister.
3. Applique les codes visuels de ${m} visibles sur l'image 2 : palette de couleurs, matériaux, traitement des murs, signalétique, typographie.
4. Place un seul logo ${m} bien visible au fond, sur un mur ou panneau LATÉRAL (côté gauche OU côté droit de l'image, jamais au centre ni derrière la caméra). Le centre de l'image doit rester dégagé pour qu'un personnage placé au milieu ne masque pas le logo. Pas de logo dupliqué.
5. Les rayons et présentoirs sont pleinement garnis de ${d} typiques de ${m}, packaging cohérent avec la photo réelle.

STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 28 mm, lumière naturelle douce, détails nets, format 16:9 paysage.

À ÉVITER : logo absent ou dupliqué, architecture différente de l'image 1, style cartoon ou illustration, texte illisible, flou, watermark, personnes visibles, ambiance centre commercial générique.`;
}

/**
 * Cadrage par défaut du tab Avatar — pré-rempli dans le champ "Contexte"
 * et injecté tel quel dans le prompt. Reproduit le rendu LMS Metagora :
 * personnage centré, plan 3/4 buste, face caméra, boutique en arrière-plan.
 */
export const DEFAULT_AVATAR_CADRAGE = `Avatar centré horizontalement dans l'image, au premier plan, plan américain (visible de la tête jusqu'à mi-cuisse / taille), face à la caméra dans une posture d'accueil naturelle, comme un vendeur qui s'adresse au client. La boutique reste pleinement visible derrière le personnage et de chaque côté, légèrement défocalisée pour mettre le personnage en valeur. Échelle réaliste : la tête de l'avatar atteint environ 60% de la hauteur de l'image.`;

/**
 * Consigne d'expression — un léger sourire bouche fermée, accueillant mais
 * discret. Réutilisée dans le prompt avatar ET dans le prompt accessoire pour
 * garantir que l'expression est appliquée même si l'utilisateur arrive
 * directement dans le tab Accessoires avec une image externe.
 */
const SMILE_INSTRUCTION = `Expression : léger sourire bouche fermée (lèvres jointes, coins de la bouche légèrement relevés, joues à peine soulevées), regard chaleureux. PAS de dents visibles, PAS de bouche ouverte. Posture accueillante de vendeur en magasin.`;

/**
 * Prompt pour la fusion avatar + fond de boutique.
 *
 * Deux images sont fournies dans cet ordre :
 *  1. Avatar (personnage / client virtuel)
 *  2. Fond de boutique (intérieur magasin)
 *
 * Le contexte (cadrage + détails optionnels) est injecté tel quel comme
 * consigne forte. Si vide, on retombe sur DEFAULT_AVATAR_CADRAGE.
 */
export function buildAvatarPrompt(context: string): string {
  const c = (context || '').trim() || DEFAULT_AVATAR_CADRAGE;
  return `Compose une seule image photoréaliste : place le personnage de l'image 1 (avatar) à l'intérieur de la boutique de l'image 2 (décor).

CONSIGNES STRICTES :
1. Préserve EXACTEMENT l'identité du personnage de l'image 1 (visage, traits, coiffure, morphologie, couleur de peau, tenue, accessoires existants). Le personnage doit rester reconnaissable au pixel près. SEULE EXCEPTION : l'expression du visage peut être ajustée selon la règle 2.
2. EXPRESSION — règle prioritaire : ${SMILE_INSTRUCTION}
3. Préserve EXACTEMENT l'architecture, l'éclairage, les produits, les vitrines, le sol, les murs et la perspective de la boutique de l'image 2.
4. CADRAGE — règle prioritaire : ${c}
5. Lumière et balance des blancs unifiées entre le personnage et le décor : ombres portées cohérentes avec la lumière de la boutique, échelle réaliste par rapport au mobilier (pas d'effet "découpe collée").
6. Un seul personnage visible.

STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 35 mm pleine ouverture, lumière naturelle douce, format 16:9 paysage.

À ÉVITER : visage différent du personnage source, bouche ouverte ou dents visibles, expression neutre/sévère/triste, plusieurs personnes, architecture modifiée, ombre incohérente, effet collage / découpage, style cartoon, texte illisible, watermark, cadrage trop large où le personnage devient minuscule.`;
}

// ─── Retouche avatar déjà en boutique ────────────────────

/**
 * Presets de pose du mode « Retoucher en boutique » — affichés en boutons
 * cliquables qui pré-remplissent / complètent la consigne de retouche.
 */
export const AVATAR_POSE_PRESETS: { label: string; text: string }[] = [
  { label: 'Bras le long du corps', text: 'baisse les deux bras le long du corps, posture droite et détendue' },
  { label: 'Mains jointes devant', text: 'place les deux mains jointes devant le buste, dans une posture d\'accueil' },
  { label: 'Bras croisés', text: 'croise les bras devant le buste, posture posée et assurée' },
  { label: 'Main sur la hanche', text: 'pose une main sur la hanche, l\'autre bras le long du corps' },
  { label: 'Regard caméra', text: 'oriente le visage et le regard bien droit vers la caméra' },
  { label: 'Sourire léger', text: 'donne au personnage un léger sourire naturel et avenant' },
];

/**
 * Prompt pour retoucher un avatar DÉJÀ intégré dans une boutique.
 *
 * Une seule image est fournie au modèle (avatar + décor déjà composés).
 * On ne touche QUE le personnage selon la consigne ; le décor, le cadrage
 * et le visage sont verrouillés. Utilisé en mode édition 1-image
 * (Azure /images/edits ou Gemini editImageWithGemini).
 *
 * @param instruction  Consigne libre de l'utilisateur (pose, expression…).
 */
export function buildAvatarRetouchPrompt(instruction: string): string {
  const c = (instruction || '').trim()
    || 'ajuste légèrement la posture du personnage pour qu\'elle paraisse naturelle et détendue';
  return `Retouche le personnage présent dans l'image fournie selon la consigne ci-dessous, SANS rien changer d'autre dans l'image.

CONSIGNE DE RETOUCHE (priorité absolue) : ${c}

CONSIGNES STRICTES :
1. Modifie UNIQUEMENT ce que demande la consigne de retouche. Tout le reste de l'image doit rester identique au pixel près.
2. Préserve EXACTEMENT le décor : architecture, boutique, vitrines, produits, étagères, sol, murs, éclairage et perspective. Si la nouvelle posture dégage une zone de fond auparavant masquée par le personnage, reconstitue ce fond dans la continuité exacte du décor existant (mêmes éléments, mêmes couleurs, même lumière).
3. Préserve EXACTEMENT le cadrage : même angle de caméra, même focale, même zoom, même position et même échelle du personnage dans l'image. Ne recadre pas, ne dézoome pas, ne déplace pas le personnage.
4. Préserve EXACTEMENT le visage, la coiffure, la morphologie, la carnation, la tenue et les accessoires du personnage — il doit rester strictement reconnaissable. Ne change ni l'identité ni les vêtements, sauf si la consigne de retouche le demande explicitement.
5. Lumière, ombres portées et balance des blancs cohérentes : les zones modifiées reçoivent la même direction de lumière que le reste de la scène, sans effet « collage » ni « découpage ».
6. Un seul personnage visible.

STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 35 mm, lumière naturelle douce, format 16:9 paysage. Le rendu final doit être indiscernable d'une photo réelle.

À ÉVITER : décor modifié ou déformé, cadrage / zoom / focale différents, personnage déplacé ou redimensionné, visage ou tenue altérés sans consigne, plusieurs personnes, ombres incohérentes, effet collage / détourage, style cartoon ou illustration, texte illisible, watermark.`;
}

// ─── Accessoires ─────────────────────────────────────────

export type AccessoryCategory = 'bijou' | 'foulard' | 'sac' | 'ceinture';

export interface AccessoryDef {
  id: AccessoryCategory;
  label: string;
  emoji: string;
  /** Description courte du type d'accessoire pour le prompt. */
  itemDescription: string;
  /** Zone du corps où l'accessoire doit apparaître. */
  bodyZone: string;
}

export const ACCESSORY_DEFS: AccessoryDef[] = [
  {
    id: 'bijou',
    label: 'Bijou',
    emoji: '💎',
    itemDescription: 'le bijou (collier, bracelet, bague, boucles d\'oreilles, broche)',
    bodyZone: 'au niveau du cou, des poignets, des doigts ou des oreilles selon le type de bijou présenté',
  },
  {
    id: 'foulard',
    label: 'Foulard',
    emoji: '🧣',
    itemDescription: 'le foulard / écharpe / châle',
    bodyZone: 'autour du cou ou sur les épaules, drapé naturellement avec des plis réalistes',
  },
  {
    id: 'sac',
    label: 'Sac',
    emoji: '👜',
    itemDescription: 'le sac (sac à main, sac à dos, pochette, sac bandoulière)',
    bodyZone: 'porté à la main, sur l\'épaule ou en bandoulière selon le type de sac, avec la sangle correctement positionnée',
  },
  {
    id: 'ceinture',
    label: 'Ceinture',
    emoji: '➰',
    itemDescription: 'la ceinture',
    bodyZone: 'à la taille, par-dessus le vêtement, correctement ajustée et bouclée',
  },
];

/**
 * Échelle de référence par catégorie d'accessoire — sert à briefer l'IA pour
 * qu'elle respecte la taille réelle de l'objet plutôt que de zoomer dessus.
 * Couvre les tailles typiques observées sur ce type d'accessoire en magasin.
 */
const ACCESSORY_REAL_SCALE: Record<AccessoryCategory, string> = {
  bijou:
    "Échelle réelle : un bijou (collier, bracelet, bague, boucles, broche) est petit — un collier descend de 30 à 50 cm sur le buste, un bracelet fait 6 à 8 cm de diamètre au poignet, une bague et des boucles font quelques mm à 2 cm. NE PAS agrandir le bijou.",
  foulard:
    "Échelle réelle : un foulard / carré de soie fait 70 à 90 cm de côté ; déplié sur les épaules il couvre approximativement la largeur du buste. NE PAS faire occuper au foulard plus de la moitié haute du buste.",
  sac:
    "Échelle réelle : un sac à main typique (type Birkin 25, Kelly, hobo, tote moyen) mesure 20 à 35 cm de large pour 18 à 28 cm de haut. Sur le personnage, il occupe l'espace allant approximativement de la taille à la mi-cuisse quand il est porté à la main, OU est plaqué contre la hanche s'il est en bandoulière. Un sac à main n'est JAMAIS plus haut qu'entre la taille et le genou. NE PAS le faire occuper la moitié de l'image. NE PAS zoomer dessus.",
  ceinture:
    "Échelle réelle : une ceinture fait 2 à 5 cm de hauteur visible, posée à la taille naturelle, et fait le tour complet du buste. La boucle est centrée devant. NE PAS exagérer la largeur de la ceinture.",
};

export function getAccessoryDef(id: AccessoryCategory): AccessoryDef | undefined {
  return ACCESSORY_DEFS.find((a) => a.id === id);
}

/**
 * Prompt pour ajouter UN accessoire sur une image existante.
 *
 * Deux images sont fournies dans cet ordre :
 *  1. Image de départ (avatar + boutique, potentiellement avec d'autres
 *     accessoires déjà ajoutés à des étapes précédentes)
 *  2. Image de l'accessoire à ajouter
 *
 * Règle clé : les accessoires sont CUMULATIFS (les accessoires déjà présents
 * sur l'image 1 doivent être conservés en plus du nouvel accessoire ajouté).
 *
 * @param accessory           Définition de l'accessoire à ajouter
 * @param extra               Instruction libre complémentaire saisie par
 *                            l'utilisateur (placement précis, main, posture,
 *                            etc.) — vide si non utilisée
 * @param visionDescription   Description automatique de l'accessoire produite
 *                            par Vision juste avant l'appel (matériau, couleur,
 *                            type, taille typique). Injectée comme brief visuel
 *                            pour que gpt-image cible exactement le bon objet.
 */
export function buildAccessoryPrompt(
  accessory: AccessoryDef,
  extra?: string,
  visionDescription?: string
): string {
  const extraBlock = (extra || '').trim()
    ? `\nINSTRUCTION COMPLÉMENTAIRE UTILISATEUR (priorité haute, à respecter en plus des consignes ci-dessus) :\n${extra!.trim()}\n`
    : '';

  const visionBlock = (visionDescription || '').trim()
    ? `\nBRIEF VISUEL DE L'ACCESSOIRE (extrait automatiquement de l'image 2 — utilise-le pour reproduire fidèlement l'objet, sans l'agrandir ni le déformer) :\n${visionDescription!.trim()}\n`
    : '';

  return `Ajoute l'accessoire de l'image 2 (${accessory.itemDescription}) sur le personnage présent dans l'image 1, en respectant strictement le modèle de l'accessoire. L'accessoire de l'image 2 DOIT être clairement visible dans l'image finale.

CONSIGNES STRICTES :
1. CADRAGE IDENTIQUE — règle absolument prioritaire : le cadrage final doit être STRICTEMENT identique à celui de l'image 1 (mêmes bords haut/bas/gauche/droite, même focale apparente, même distance caméra-personnage, même portion du corps visible). N'effectue AUCUN zoom in, AUCUN zoom out, AUCUN recadrage, AUCUNE recomposition. Le personnage doit occuper exactement la même surface et la même POSITION dans l'image finale que dans l'image 1 : même position horizontale (s'il est centré dans l'image 1, il RESTE centré), mêmes marges de décor à sa gauche et à sa droite. NE DÉCALE JAMAIS le personnage sur un côté et N'AJOUTE PAS d'espace vide d'un côté pour faire de la place à l'accessoire — l'accessoire doit s'intégrer dans le cadrage existant sans repositionner ni redimensionner le personnage. NE FOCALISE PAS sur l'accessoire au point de tronquer ou recadrer le personnage.
2. Préserve EXACTEMENT l'identité du personnage de l'image 1 (visage, traits, coiffure, morphologie, couleur de peau, tenue, pose) ET TOUS LES ACCESSOIRES DÉJÀ PRÉSENTS (foulard, bijou, sac, ceinture, lunettes, chapeau, etc. déjà visibles restent en place et visibles). Les accessoires sont CUMULATIFS — n'enlève ni ne remplace aucun élément existant. SEULE EXCEPTION : l'expression peut être ajustée selon la règle 3.
3. EXPRESSION — règle prioritaire : ${SMILE_INSTRUCTION}
4. Préserve EXACTEMENT l'arrière-plan, l'architecture, l'éclairage, les vitrines, les produits, le sol et la perspective de l'image 1. Rien d'autre que l'ajout de l'accessoire (et l'ajustement d'expression de la règle 3) ne doit changer.
5. Place le nouvel accessoire ${accessory.bodyZone}. L'accessoire doit reprendre fidèlement la forme, la couleur, les matériaux, les détails, les motifs et le style exact de l'image 2 (mêmes finitions, mêmes proportions internes).
6. ÉCHELLE RÉELLE STRICTE : ${ACCESSORY_REAL_SCALE[accessory.id]} L'accessoire doit avoir une taille crédible par rapport à la morphologie du personnage tel qu'il apparaît dans l'image 1. Ne JAMAIS surdimensionner l'accessoire ; ne JAMAIS faire un gros plan dessus.
7. L'accessoire de l'image 2 DOIT apparaître dans le résultat — c'est l'objectif principal de l'opération. Si l'accessoire entre en conflit visuel avec un accessoire déjà présent, ajuste légèrement son placement pour qu'il reste visible (ex : ceinture par-dessus une chemise déjà nouée à la taille), mais ne supprime jamais l'accessoire existant.
8. Lumière et ombres cohérentes avec la scène : l'accessoire reçoit la même direction de lumière que le personnage et projette des ombres réalistes, sans effet "collage" ni "détourage".
${extraBlock}${visionBlock}
STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 35 mm, lumière naturelle douce, format 16:9 paysage. Le rendu final doit être indiscernable d'une photo réelle du personnage portant l'accessoire (et tous ceux déjà présents), avec le MÊME cadrage que l'image 1.

À ÉVITER : zoom in sur l'accessoire, recadrage qui tronque le personnage, décaler le personnage sur un côté du cadre, déséquilibrer les marges gauche/droite, ajouter de l'espace vide d'un côté, accessoire surdimensionné (un sac qui occupe la moitié de l'image, une ceinture épaisse comme un corset, etc.), supprimer ou remplacer un accessoire déjà présent, oublier d'ajouter l'accessoire de l'image 2, modifier le visage (sauf l'expression), bouche ouverte ou dents visibles, expression neutre/sévère/triste, modifier la pose / les vêtements existants, dupliquer ou multiplier l'accessoire, mauvaise position anatomique, ombres incohérentes, effet découpe-collage, style cartoon, watermark, texte illisible, modification du décor.`;
}

/**
 * Prompt envoyé à un modèle Vision (gpt-5-2 ou gemini-2.5-flash) pour analyser
 * l'image d'un accessoire et produire un brief visuel court et exploitable par
 * gpt-image lors de l'ajout sur l'avatar.
 *
 * Sortie attendue : 3-6 lignes en français, factuelles, sans préambule ni
 * conclusion. Pas de markdown, pas de listes à puces.
 */
export function buildAccessoryAnalysisPrompt(accessory: AccessoryDef): string {
  return `Tu es un assistant qui prépare un brief visuel pour un modèle de génération d'images.

L'image jointe est ${accessory.itemDescription}. Décris-la précisément en 3 à 6 lignes pour qu'un modèle text-to-image puisse la reproduire fidèlement quand on l'ajoutera sur un personnage existant.

Inclure obligatoirement :
- Type précis de l'objet (ex : "sac à main type Birkin", "carré de soie 90×90 cm", "collier ras-de-cou", "ceinture à boucle H")
- Matériau principal et finition (ex : "cuir togo grainé mat", "soie satinée", "or jaune brossé")
- Couleur(s) dominante(s) avec nuance (ex : "gold caramel", "bleu marine + crème + or")
- Motifs visibles, logos, signes distinctifs (sans inventer)
- Quincaillerie / détails (boucle, fermoir, cadenas, surpiqûres)
- Dimensions réelles approximatives (largeur × hauteur en cm) pour cadrer la taille de l'objet sur le personnage. Si tu n'es pas sûr, donne une fourchette typique.
- Placement recommandé sur le personnage en une demi-phrase (main, épaule, cou, taille…) cohérent avec le type d'objet.

Format de sortie : prose factuelle en français, 3 à 6 lignes, sans préambule (pas de "Voici la description…"), sans markdown, sans liste à puces, sans conclusion. Termine la dernière ligne par un point.

À ÉVITER : inventer des marques ou des détails non visibles, faire de la prose marketing, suggérer un cadrage caméra (le cadrage est déjà fixé par l'image cible), surdimensionner l'objet.`;
}
