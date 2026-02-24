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

  return `Utiliser la boutique 3D Metagora comme modèle architectural principal et la boutique réelle ${m} comme référence d'univers de marque et de produits.
Générer une nouvelle image où la boutique ${m} adopte la structure et le design spatial de la boutique 3D Metagora : même angle de vue, même profondeur, même forme des murs, mêmes colonnes et poteaux, même disposition générale des meubles centraux et des étagères murales, même logique d'éclairage au plafond.
Conserver et adapter les codes visuels visibles sur la photo réelle de ${m} : palette de couleurs, style de mobilier, traitement des murs, type de lumière, style de signalétique, logos et typographies, de façon cohérente et lisible, avec exactement un seul logo ${m} bien visible sur un mur ou un panneau au fond de la boutique (le logo ne doit apparaître qu'une seule fois dans l'image).
Remplacer TOUS les produits visibles dans l'image de base sans exception : aucun produit d'origine ne doit subsister. Tous les rayons, présentoirs et étagères doivent être garnis exclusivement de ${d} caractéristiques de ${m}, avec packaging et supports de communication cohérents avec la photo réelle.
Le résultat doit être un espace où l'on reconnaît immédiatement la structure de la boutique 3D Metagora tout en identifiant clairement l'univers et l'identité de ${m} tels qu'ils apparaissent sur l'image réelle fournie.
L'image générée doit être à la résolution la plus haute possible, idéalement 4K (3840×2160) ou au minimum Full HD (1920×1080).
Style photographie ultra réaliste, haute définition, objectif 24–35 mm, couleurs naturelles, lumière douce et homogène, détails nets sur les matériaux et les produits.
Negative prompt : architecture complètement différente de la boutique 3D Metagora, codes visuels sans lien avec la photo réelle de ${m}, logo ${m} absent ou illisible, logo dupliqué ou logos multiples, ambiance de centre commercial générique, texte illisible, flou, low‑res, style cartoon ou peinture, watermark, visages humains visibles.`;
}
