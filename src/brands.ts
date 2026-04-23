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
