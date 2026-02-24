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

  return `Transformer la boutique réelle ${m} en reprenant le style architectural, le merchandising et l'ambiance de la boutique 3D modèle Metagora, tout en conservant clairement l'identité visuelle ${m} et la mise en avant de ${d}.
Conserver l'angle de vue, la composition générale et le volume de la boutique ${m} d'origine, avec la même position des meubles centraux, des étagères murales et des circulations principales.
Appliquer à la boutique ${m} les éléments de design inspirés du modèle 3D Metagora : lignes architecturales contemporaines, présentoirs circulaires, colonnes lumineuses élégantes, éclairage homogène et valorisant, afin de créer une ambiance immersive et premium.
Adapter les matériaux, textures et couleurs pour rester cohérent avec l'univers ${m} : mobilier clair et chaleureux, touches de couleurs caractéristiques de la marque, signalétique lisible, écrans et supports de démonstration produits.
Remplacer ou réorganiser les produits exposés pour mettre fortement en avant ${d} : rayons dédiés, présentoirs centraux avec produits mis en valeur, PLV et supports pédagogiques cohérents avec ${m}.
Atmosphère globale : magasin ${m} moderne, technologique et accueillant, à la fois expert et accessible, mettant en avant l'expérience client autour des produits.
Style photographie ultra réaliste, haute définition, objectif 24–35 mm, couleurs naturelles, lumière douce et bien répartie, détails nets sur les matériaux, les écrans et les appareils.
Negative prompt : incohérences de marque (logos d'autres enseignes, couleurs non ${m}), look de centre commercial anonyme, marbre brillant inutile, métal doré ostentatoire, texte illisible, flou, low‑res, style cartoon ou peinture, watermark, visages humains visibles.`;
}
