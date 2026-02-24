export interface UniversConfig {
  label: string;
  defaultMarque: string;
  defaultDescription: string;
}

export const UNIVERS: Record<string, UniversConfig> = {
  ballotFlurinMiel: {
    label: 'Miel & Apithérapie',
    defaultMarque: 'Ballot-Flurin',
    defaultDescription: 'gamme apithérapie et produits dérivés du miel Ballot‑Flurin',
  },
  parfumerieLuxe: {
    label: 'Parfumerie de luxe',
    defaultMarque: 'Maison de parfum prestige',
    defaultDescription: 'collection de parfums haute couture et coffrets prestige',
  },
  maisonTheJaponaise: {
    label: 'Maison de thé japonaise',
    defaultMarque: 'Maison de thé artisanale',
    defaultDescription: 'sélection de thés matcha, sencha et accessoires en céramique artisanale',
  },
  cosmetiqueBio: {
    label: 'Cosmétique bio & naturelle',
    defaultMarque: 'Cosmétique bio',
    defaultDescription: 'soins visage et corps certifiés bio, huiles essentielles et sérums végétaux',
  },
  chocolaterieFine: {
    label: 'Chocolaterie fine artisanale',
    defaultMarque: 'Chocolaterie artisanale',
    defaultDescription: 'tablettes grand cru, pralinés maison et coffrets dégustation',
  },
  maroquinerieCuir: {
    label: 'Maroquinerie cuir premium',
    defaultMarque: 'Maroquinerie premium',
    defaultDescription: 'sacs, ceintures et petite maroquinerie en cuir pleine fleur',
  },
};

/**
 * Génère le prompt complet pour Nano Banana à partir de la marque et de la description produit.
 */
export function buildBrandPrompt(marque: string, description: string): string {
  return `Transformer la boutique source en boutique type ${marque}, spécialisée dans ${description}.
Conserver la même architecture et composition que la boutique d'origine : même angle de vue frontal, même volume, même position des meubles centraux et muraux, même circulation principale, même éclairage global de boutique.
Remplacer les matériaux d'origine par des matériaux cohérents avec l'univers de ${marque} : bois, textures, couleurs et signalétique adaptés à ${description}.
Substituer tous les produits d'origine par une mise en avant détaillée de ${description} : rayons, présentoirs, packaging, signalétique et éléments de storytelling cohérents avec la marque ${marque}.
Atmosphère globale en accord avec l'ADN de ${marque} (valeurs, niveau de luxe, naturalité, etc.), tout en gardant la lisibilité et la structure merchandising de la boutique d'origine.
Style photographie ultra réaliste, haute définition, objectif 24–35 mm, couleurs naturelles, lumière douce, détails nets sur les matériaux et les produits.
Negative prompt : incohérences de marque, look de centre commercial sans âme, marbre brillant ou métal doré si non cohérent avec ${marque}, texte illisible, flou, low‑res, style cartoon ou peinture, watermark, visages humains.`;
}
