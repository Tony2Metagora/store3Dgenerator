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
4. Place un seul logo ${m} bien visible au fond, sur un mur ou panneau. Pas de logo dupliqué.
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
