/**
 * Catalogue des 5 moules architecturaux Metagora.
 *
 * Chaque moule est une boutique 3D vide (sans produits et sans logo) qui sert
 * de structure de base pour plaquer l'univers d'une marque par-dessus.
 *
 * Le moule `bijouterie` est fourni en dur (public/model-store.jpg).
 * Les 4 autres sont générés via Gemini (text-to-image) et stockés en IndexedDB.
 */

export type MouleCategory =
  | 'bijouterie'
  | 'mode'
  | 'cosmetique'
  | 'tech'
  | 'alimentaire';

export interface MouleDef {
  id: MouleCategory;
  label: string;
  emoji: string;
  /** Description courte pour l'UI. */
  description: string;
  /** Types de mobilier/présentation dominants (utilisé dans le prompt de génération marque). */
  fixtures: string;
  /** Image seed optionnelle livrée avec l'app (public/). */
  seedImage?: string;
  /** Prompt text-to-image pour générer un moule neuf. */
  genPrompt: string;
}

/**
 * Base commune à tous les prompts de génération de moule :
 * même cadrage, même style de lumière, même rendu photographique.
 */
const COMMON_MOULE_STYLE = `Photographie architecturale d'intérieur ultra-réaliste, 4K, format paysage 16:9.
Vue depuis l'entrée de la boutique, angle 3/4, objectif 28 mm, hauteur œil humain.
La composition montre clairement le sol, les deux murs latéraux avec leurs étagères/vitrines, le plafond éclairé et le mur du fond.
Ambiance boutique haut de gamme vide le matin avant ouverture : pas de client, pas de vendeur, pas de produits, pas de logo, pas de marque visible, pas de texte.
Lumière douce et homogène, tons naturels, matériaux nets et détaillés.`;

export const MOULES: MouleDef[] = [
  {
    id: 'bijouterie',
    label: 'Bijouterie / Joaillerie',
    emoji: 'diamond',
    description: 'Vitrines verre, bustes, présentoirs bijoux — luxe minimaliste.',
    fixtures: 'vitrines en verre, bustes à colliers, présentoirs plats pour bijoux, petits socles',
    seedImage: 'model-store.jpg',
    genPrompt: `${COMMON_MOULE_STYLE}

Boutique de joaillerie haut de gamme :
- Vitrines en verre éclairées sur les murs latéraux
- Bustes noirs mats pour colliers disposés sur des socles bas au centre
- Quelques présentoirs plats en velours sur comptoirs fins
- Sol en marbre clair ou bois noble, murs texturés neutres
- Spots ponctuels orientés, plafond sombre
Boutique vide de bijoux.`,
  },
  {
    id: 'mode',
    label: 'Mode / Maroquinerie',
    emoji: 'handbag',
    description: 'Portants, tables basses, étagères murales — vêtements & sacs.',
    fixtures: 'portants métalliques, tables basses en bois, étagères murales ouvertes, mannequins',
    genPrompt: `${COMMON_MOULE_STYLE}

Boutique de mode et maroquinerie haut de gamme :
- Portants métalliques fins sur les murs latéraux
- Tables basses en bois ou marbre au centre
- Étagères murales ouvertes pour sacs et accessoires
- Quelques mannequins neutres sans vêtements
- Sol en bois clair, murs blancs ou beiges, plafond avec rails de spots
Boutique vide de vêtements et sacs.`,
  },
  {
    id: 'cosmetique',
    label: 'Cosmétique / Parfumerie',
    emoji: 'flask',
    description: 'Rayons muraux, comptoirs bas, miroirs — soins & parfums.',
    fixtures: 'rayons muraux lumineux à plusieurs niveaux, comptoirs bas de test, étagères en verre',
    genPrompt: `${COMMON_MOULE_STYLE}

Boutique de cosmétique et parfumerie haut de gamme :
- Rayons muraux lumineux à plusieurs niveaux sur les deux côtés
- Comptoirs bas de test avec miroirs au centre
- Quelques étagères en verre fines
- Sol en pierre claire ou terrazzo, murs clairs, éclairage LED chaleureux
- Plafond bas avec bandes lumineuses
Boutique vide de produits cosmétiques.`,
  },
  {
    id: 'tech',
    label: 'Tech / Électronique',
    emoji: 'laptop',
    description: 'Tables de démonstration, écrans, étagères — gadgets & devices.',
    fixtures: 'tables de démonstration en bois clair, étagères murales épurées, supports de présentation',
    genPrompt: `${COMMON_MOULE_STYLE}

Boutique tech premium style Apple Store :
- Longues tables de démonstration en bois clair au centre
- Étagères murales épurées sur les deux côtés
- Supports de présentation bas
- Sol en pierre gris clair, murs blancs mats, plafond très clair avec lumière diffuse
- Atmosphère minimaliste
Boutique vide de produits tech.`,
  },
  {
    id: 'alimentaire',
    label: 'Alimentaire / Épicerie fine',
    emoji: 'shop',
    description: 'Rayons bois, îlots, comptoirs — épicerie & boissons premium.',
    fixtures: 'rayons en bois, îlots centraux, comptoirs avec balance, paniers',
    genPrompt: `${COMMON_MOULE_STYLE}

Boutique d'épicerie fine haut de gamme :
- Rayons muraux en bois foncé sur les deux côtés
- Îlots centraux en bois avec surfaces planes
- Comptoir avec balance artisanale
- Quelques paniers en osier vides
- Sol en carrelage patine ou bois brut, murs chaleureux, suspensions type abat-jour métal
Boutique vide d'épicerie.`,
  },
];

export function getMouleById(id: string): MouleDef | undefined {
  return MOULES.find((m) => m.id === id);
}
