/**
 * Génère le prompt complet pour Gemini.
 *
 * Deux images sont fournies dans l'appel API :
 *  - Image 1 : l'image modèle 3D Metagora (design de référence, fixe)
 *  - Image 2 : la photo du magasin réel de la marque cible (uploadée par l'utilisateur)
 *
 * Template basé sur le prompt Fnac validé, avec marque et description dynamiques.
 */
export function buildBrandPrompt(marque: string, description: string): string {
  const m = marque || '[marque]';
  const d = description || '[description produit]';

  return `Transformer la boutique réelle ${m} en reprenant avec précision l'architecture, la structure spatiale et la mise en scène de la boutique 3D modèle Metagora utilisée comme référence, tout en conservant clairement l'univers visuel existant de ${m} tel qu'il apparaît sur la photo réelle (codes couleurs, style de mobilier, signalétique, type de produits).
Conserver l'angle de vue, la profondeur et la composition générale de la boutique réelle ${m}, mais aligner la forme des murs, des colonnes, des courbes, des plafonds, des présentoirs centraux et des étagères murales sur ceux de la boutique modèle Metagora : mêmes grandes lignes architecturales, même rythme de meubles, mêmes volumes principaux.
Adapter matériaux, textures et éclairages pour combiner la structure Metagora et l'univers de ${m} tel qu'il est visible sur la photo : garder les couleurs de marque, la typographie, le style de mobilier (par exemple bois clair high‑tech pour Fnac, cave chaleureuse et bois foncé pour Maison Nicolas, etc.), la signalétique et les éléments caractéristiques du magasin réel.
Remplacer ou réorganiser les produits exposés pour mettre fortement en avant ${d} dans l'esprit de ${m} : disposition des rayons, présentoirs centraux, facing produits, packaging et PLV cohérents avec ce que montre la photo réelle de la boutique ${m}.
Atmosphère globale : espace immersif et cohérent avec l'ADN de ${m} déjà perceptible sur l'image source, mais bénéficiant d'une architecture plus fluide et immersive inspirée du modèle Metagora.
Style photographie ultra réaliste, haute définition, objectif 24–35 mm, couleurs naturelles légèrement chaudes, lumière douce et homogène, détails nets sur les matériaux et les produits.
Negative prompt : ne pas modifier les codes de marque visibles sur la photo réelle (logo, palette de couleurs principale, typographie), éviter toute architecture qui ne rappelle pas la structure Metagora, éviter l'ambiance centre commercial générique, le style cartoon ou peinture, le texte illisible, le flou, le low‑res, les watermark et les visages humains visibles.`;
}
