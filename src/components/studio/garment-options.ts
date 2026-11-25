/**
 * Options de construction du vêtement (col, poches), partagées par la vue 3D et le patron à plat.
 *
 * Les poches sont décrites dans un repère commun au deux vues :
 * - `dx` : écart horizontal depuis le milieu devant, en radians autour du buste
 *   (négatif = à gauche vu de face, positif = à droite) ;
 * - `y`  : hauteur dans la scène 3D (le bas du vêtement dépend de la longueur).
 * La 3D projette ces points sur la surface du gilet, le patron les projette sur le devant à plat :
 * une poche est donc toujours au même endroit dans les deux vues.
 */

export type CollarStyle = 'montant' | 'rond' | 'capuche' | 'bord_cote';
export type PocketFormat = 'plaquee' | 'poitrine' | 'passepoilee' | 'kangourou';
export type PocketSide = 'gauche' | 'droite' | 'centre' | 'double';
export type PocketLevel = 'poitrine' | 'milieu' | 'bas';
export type ClosureType = 'zip' | 'demi_zip' | 'boutons' | 'aucune';
export type ClosureFinish = 'metal' | 'noir_mat' | 'assorti';

export interface PocketSpec {
  id: string;
  format: PocketFormat;
  side: PocketSide;
  level: PocketLevel;
  /** Décalage horizontal libre, de -1 (vers l'extérieur gauche) à 1. */
  offset: number;
  visible: boolean;
}

export interface GarmentOptions {
  /** Vêtement du catalogue (ex. « gilet_zippe », « sweat_capuche ») : enregistré avec le modèle. */
  kind?: string;
  collar: CollarStyle;
  pockets: PocketSpec[];
  closure: ClosureType;
  finish: ClosureFinish;
}

export const CLOSURE_TYPES: { id: ClosureType; label: string }[] = [
  { id: 'zip', label: 'Zip complet' },
  { id: 'demi_zip', label: 'Demi-zip' },
  { id: 'boutons', label: 'Boutons' },
  { id: 'aucune', label: 'Sans' },
];

export const CLOSURE_FINISHES: { id: ClosureFinish; label: string }[] = [
  { id: 'metal', label: 'Métal' },
  { id: 'noir_mat', label: 'Noir mat' },
  { id: 'assorti', label: 'Assorti au tissu' },
];

/** Bas du demi-zip, en hauteur de scène (poitrine). */
export const HALF_ZIP_BOTTOM = 0.2;

/** Hauteurs des boutons le long du milieu devant, du bas vers le haut. */
export function buttonHeights(bottom: number, top: number): number[] {
  const first = bottom + 0.3;
  const last = top - 0.12;
  const count = 5;
  return Array.from({ length: count }, (_, index) => first + ((last - first) * index) / (count - 1));
}

export const COLLAR_STYLES: { id: CollarStyle; label: string }[] = [
  { id: 'montant', label: 'Col montant' },
  { id: 'rond', label: 'Col rond' },
  { id: 'capuche', label: 'Capuche' },
  { id: 'bord_cote', label: 'Bord-côte' },
];

export const POCKET_FORMATS: { id: PocketFormat; label: string }[] = [
  { id: 'plaquee', label: 'Plaquée' },
  { id: 'poitrine', label: 'Poitrine' },
  { id: 'passepoilee', label: 'Latérale' },
  { id: 'kangourou', label: 'Kangourou' },
];

export const POCKET_SIDES: { id: PocketSide; label: string }[] = [
  { id: 'gauche', label: 'Gauche' },
  { id: 'droite', label: 'Droite' },
  { id: 'double', label: 'Les deux' },
  { id: 'centre', label: 'Centre' },
];

export const POCKET_LEVELS: { id: PocketLevel; label: string }[] = [
  { id: 'poitrine', label: 'Haut' },
  { id: 'milieu', label: 'Milieu' },
  { id: 'bas', label: 'Bas' },
];

export const MAX_POCKETS = 4;

export function defaultGarmentOptions(): GarmentOptions {
  return {
    collar: 'montant',
    pockets: [
      { id: 'pocket-1', format: 'plaquee', side: 'double', level: 'bas', offset: 0, visible: true },
    ],
    closure: 'zip',
    finish: 'metal',
  };
}

/** Réglages par défaut quand on choisit un format : une poche poitrine va en haut, une kangourou au centre. */
export function pocketDefaults(format: PocketFormat): Partial<PocketSpec> {
  if (format === 'kangourou') return { side: 'centre', level: 'bas', offset: 0 };
  if (format === 'poitrine') return { level: 'poitrine' };
  return {};
}

// Repère du gilet partagé avec la géométrie 3D.
export const GARMENT_TOP = 1.035;

export function garmentBottomFromLength(longueur: number): number {
  return -1.05 - (longueur - 55) * 0.006;
}

export function collarHeightFrom(style: CollarStyle, slider: number): number {
  if (style === 'rond') return 0.05 + slider * 0.0006;
  if (style === 'bord_cote') return 0.08 + slider * 0.0015;
  // Capuche : simple bande d'encolure, la capuche commence juste au-dessus.
  if (style === 'capuche') return 0.06;
  return 0.12 + slider * 0.0035;
}

/** Quadrilatère de poche : coins [haut-gauche, haut-droit, bas-droit, bas-gauche] en (dx, y). */
export interface PocketQuad {
  key: string;
  format: PocketFormat;
  corners: [number, number][];
  /** Rabat (poche poitrine) : même repère que `corners`. */
  flap: [number, number][] | null;
  /** Pression au centre du haut de la poche. */
  snap: [number, number] | null;
}

const SIZE: Record<PocketFormat, { w: number; h: number }> = {
  plaquee: { w: 0.62, h: 0.36 },
  poitrine: { w: 0.42, h: 0.26 },
  passepoilee: { w: 0.08, h: 0.36 },
  kangourou: { w: 1.3, h: 0.42 },
};

function levelCenter(level: PocketLevel, bottom: number, height: number): number {
  const low = bottom + 0.2 + height / 2;
  if (level === 'bas') return low;
  if (level === 'poitrine') return 0.42;
  return (low + 0.42) / 2 - 0.05;
}

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function pocketQuads(pockets: PocketSpec[], bottom: number): PocketQuad[] {
  const quads: PocketQuad[] = [];

  pockets.filter((pocket) => pocket.visible).forEach((pocket) => {
    const { w, h } = SIZE[pocket.format];
    const centerY = levelCenter(pocket.level, bottom, h);
    const sides: number[] = pocket.format === 'kangourou' || pocket.side === 'centre'
      ? [0]
      : pocket.side === 'double'
        ? [-1, 1]
        : [pocket.side === 'gauche' ? -1 : 1];

    sides.forEach((sign) => {
      // Centre de la poche : à 0.65 rad du milieu devant, décalable de ±0.3 rad (en miroir si double).
      const base = sign === 0 ? 0 : sign * 0.65;
      const shift = sign === 0 ? pocket.offset * 0.3 : sign * pocket.offset * 0.3;
      const limit = 1.3 - w / 2;
      const cx = clampValue(base + shift, -limit, limit);
      const y0 = centerY - h / 2;
      const y1 = centerY + h / 2;
      const key = `${pocket.id}-${sign}`;

      if (pocket.format === 'kangourou') {
        // Trapèze : plus large en bas, ouvertures en biais sur les côtés.
        const top = w * 0.32;
        quads.push({
          key,
          format: pocket.format,
          corners: [[cx - top, y1], [cx + top, y1], [cx + w / 2, y0], [cx - w / 2, y0]],
          flap: null,
          snap: null,
        });
      } else if (pocket.format === 'passepoilee') {
        // Fente en biais : le haut penche vers le milieu devant.
        const lean = sign === 0 ? 0 : -sign * 0.12;
        quads.push({
          key,
          format: pocket.format,
          corners: [[cx - w / 2 + lean, y1], [cx + w / 2 + lean, y1], [cx + w / 2, y0], [cx - w / 2, y0]],
          flap: null,
          snap: null,
        });
      } else {
        const flapHeight = pocket.format === 'poitrine' ? 0.09 : 0;
        quads.push({
          key,
          format: pocket.format,
          corners: [[cx - w / 2, y1], [cx + w / 2, y1], [cx + w / 2, y0], [cx - w / 2, y0]],
          flap: flapHeight
            ? [[cx - w / 2 - 0.01, y1 + 0.01], [cx + w / 2 + 0.01, y1 + 0.01], [cx + w / 2 + 0.01, y1 - flapHeight], [cx - w / 2 - 0.01, y1 - flapHeight]]
            : null,
          snap: [cx, y1 - (flapHeight ? flapHeight * 0.55 : 0.07)],
        });
      }
    });
  });

  return quads;
}

let pocketCounter = 1;
export function newPocketId(): string {
  pocketCounter += 1;
  return `pocket-${Date.now().toString(36)}-${pocketCounter}`;
}
