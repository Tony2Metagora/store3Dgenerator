/**
 * Génère le prompt complet pour Gemini.
 *
 * Deux images sont fournies dans l'appel API :
 *  - Image 1 : l'image modèle 3D Metagora (design de référence, fixe)
 *  - Image 2 : la photo du magasin réel de la marque cible (uploadée par l'utilisateur)
 *
 * Le prompt demande de transformer le magasin réel en y appliquant
 * le style architectural et merchandising de l'image modèle 3D,
 * tout en intégrant l'identité de la marque et ses produits.
 */
export function buildBrandPrompt(marque: string, description: string): string {
  return `Tu reçois deux images :
- Image 1 : une boutique 3D modèle Metagora (design de référence).
- Image 2 : la photo du magasin réel de la marque ${marque || '[marque]'}.

Génère une nouvelle image en transformant le magasin réel (image 2) pour qu'il adopte le style architectural, le merchandising et l'ambiance de la boutique 3D modèle (image 1), tout en conservant l'identité visuelle de ${marque || '[marque]'} et ses produits : ${description || '[description produit]'}.

Consignes détaillées :
- Reprendre la structure architecturale de l'image modèle 3D : disposition des meubles, étagères murales, présentoirs centraux, circulation, éclairage par anneaux dorés suspendus.
- Adapter les matériaux, textures et couleurs pour qu'ils soient cohérents avec l'univers de ${marque || '[marque]'} : bois, signalétique, packaging, éléments de storytelling.
- Remplacer les produits exposés par une mise en avant détaillée de ${description || '[description produit]'} : rayons, présentoirs, packaging et signalétique cohérents avec la marque.
- Atmosphère globale en accord avec l'ADN de ${marque || '[marque]'} (valeurs, niveau de luxe, naturalité, etc.).
- Style photographie ultra réaliste, haute définition, objectif 24–35 mm, couleurs naturelles, lumière douce, détails nets sur les matériaux et les produits.
- Negative prompt : incohérences de marque, look de centre commercial sans âme, marbre brillant ou métal doré si non cohérent avec ${marque || '[marque]'}, texte illisible, flou, low-res, style cartoon ou peinture, watermark, visages humains.`;
}
