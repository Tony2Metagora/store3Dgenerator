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
1. Préserve EXACTEMENT le visage, la coiffure, la morphologie, la tenue et les accessoires du personnage de l'image 1. Le personnage doit rester reconnaissable au pixel près.
2. Préserve EXACTEMENT l'architecture, l'éclairage, les produits, les vitrines, le sol, les murs et la perspective de la boutique de l'image 2.
3. CADRAGE — règle prioritaire : ${c}
4. Lumière et balance des blancs unifiées entre le personnage et le décor : ombres portées cohérentes avec la lumière de la boutique, échelle réaliste par rapport au mobilier (pas d'effet "découpe collée").
5. Un seul personnage visible.

STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 35 mm pleine ouverture, lumière naturelle douce, format 16:9 paysage.

À ÉVITER : visage différent du personnage source, plusieurs personnes, architecture modifiée, ombre incohérente, effet collage / découpage, style cartoon, texte illisible, watermark, cadrage trop large où le personnage devient minuscule.`;
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
 * @param accessory  Définition de l'accessoire à ajouter
 * @param extra      Instruction libre complémentaire saisie par l'utilisateur
 *                   (placement précis, main, posture, etc.) — vide si non utilisée
 */
export function buildAccessoryPrompt(accessory: AccessoryDef, extra?: string): string {
  const extraBlock = (extra || '').trim()
    ? `\nINSTRUCTION COMPLÉMENTAIRE UTILISATEUR (priorité haute, à respecter en plus des consignes ci-dessus) :\n${extra!.trim()}\n`
    : '';

  return `Ajoute l'accessoire de l'image 2 (${accessory.itemDescription}) sur le personnage présent dans l'image 1, en respectant strictement le modèle de l'accessoire. L'accessoire de l'image 2 DOIT être clairement visible dans l'image finale.

CONSIGNES STRICTES :
1. Préserve EXACTEMENT le visage, la coiffure, la morphologie, la tenue, la pose ET TOUS LES ACCESSOIRES DÉJÀ PRÉSENTS sur le personnage de l'image 1 (foulard, bijou, sac, ceinture, lunettes, chapeau, etc. déjà visibles doivent rester en place et visibles). Les accessoires sont CUMULATIFS — n'enlève ni ne remplace aucun élément existant.
2. Préserve EXACTEMENT l'arrière-plan, l'architecture, l'éclairage, les vitrines, les produits, le sol et la perspective de l'image 1. Rien d'autre que l'ajout de l'accessoire ne doit changer.
3. Place le nouvel accessoire ${accessory.bodyZone}. L'accessoire doit reprendre fidèlement la forme, la couleur, les matériaux, les détails et le style exact de l'image 2 (mêmes finitions, mêmes motifs, mêmes proportions).
4. L'accessoire de l'image 2 DOIT apparaître dans le résultat — c'est l'objectif principal de l'opération. Si l'accessoire entre en conflit visuel avec un accessoire déjà présent, ajuste légèrement son placement pour qu'il reste visible (ex : ceinture par-dessus une chemise déjà nouée à la taille), mais ne supprime jamais l'accessoire existant.
5. Lumière et ombres cohérentes avec la scène : l'accessoire reçoit la même direction de lumière que le personnage et projette des ombres réalistes, sans effet "collage" ni "détourage".
6. Échelle réaliste : l'accessoire a une taille crédible par rapport au personnage et au cadre.
${extraBlock}
STYLE : photographie d'intérieur ultra-réaliste, 4K, objectif 35 mm, lumière naturelle douce, format 16:9 paysage. Le rendu final doit être indiscernable d'une photo réelle du personnage portant l'accessoire (et tous ceux déjà présents).

À ÉVITER : supprimer ou remplacer un accessoire déjà présent sur le personnage, oublier d'ajouter l'accessoire de l'image 2, modifier le visage / la pose / les vêtements existants, dupliquer ou multiplier l'accessoire, mauvaise échelle, mauvaise position anatomique, ombres incohérentes, effet découpe-collage, style cartoon, watermark, texte illisible, modification du décor.`;
}
