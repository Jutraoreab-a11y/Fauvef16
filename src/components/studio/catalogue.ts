import type { ProductType } from '@/types/famal-spec';
import { BASES } from './data';
import type { GarmentOptions } from './garment-options';
import type { StudioSpec } from './types';

export type GarmentCategory = 'haut' | 'bas' | 'manteau' | 'equipement';

export interface GarmentEntry {
  id: string;
  label: string;
  category: GarmentCategory;
  /** Base 3D déjà disponible dans le studio, sinon null (modèle à créer). */
  base: ProductType | null;
  /** Pièces connues pour ce vêtement. */
  pieces: string[];
  /** Réglages de départ sur la base 3D : col, fermeture, poches, proportions, noms des zones. */
  preset?: GarmentPreset;
}

export interface GarmentPreset {
  options: Partial<GarmentOptions>;
  sliders?: Record<string, number>;
  zoneLabels?: Record<string, string>;
}

export const GARMENT_CATEGORIES: { id: GarmentCategory; label: string }[] = [
  { id: 'haut', label: 'Hauts' },
  { id: 'bas', label: 'Bas' },
  { id: 'manteau', label: 'Manteaux et vestes' },
  { id: 'equipement', label: 'Équipement' },
];

const zoneLabels = (base: ProductType) => BASES[base].zones.map((zone) => zone.label);

export const GARMENTS: GarmentEntry[] = [
  {
    id: 'doudoune',
    label: 'Doudoune à capuche',
    category: 'manteau',
    base: null,
    pieces: ['Capuche', 'Col montant', 'Corps matelassé', 'Manches matelassées', 'Zip', 'Poches', 'Bords et ourlet', 'Piqûres de matelassage'],
  },
  {
    id: 'gilet_zippe',
    label: 'Gilet zippé',
    category: 'manteau',
    base: 'apparel',
    pieces: zoneLabels('apparel'),
    preset: { options: {} },
  },
  {
    id: 'sweat_capuche',
    label: 'Sweat à capuche',
    category: 'haut',
    base: 'apparel',
    pieces: ['Capuche', 'Devant', 'Dos', 'Manches', 'Poignets et bas en bord-côte', 'Poche kangourou', 'Coutures apparentes'],
    preset: {
      options: {
        collar: 'capuche',
        closure: 'aucune',
        finish: 'assorti',
        pockets: [{ id: 'pocket-1', format: 'kangourou', side: 'centre', level: 'bas', offset: 0, visible: true }],
      },
      sliders: { boxy: 65, longueur: 45, manches: 100, col_hauteur: 30 },
      zoneLabels: { col: 'Capuche', poches: 'Poche kangourou', bords: 'Bords-côtes (poignets et bas)' },
    },
  },
  {
    id: 't_shirt',
    label: 'T-shirt',
    category: 'haut',
    base: null,
    pieces: ['Col rond', 'Corps', 'Manches', 'Ourlet', 'Coutures'],
  },
  {
    id: 'chemise',
    label: 'Chemise',
    category: 'haut',
    base: null,
    pieces: ['Col', 'Manches', 'Poignets', 'Corps', 'Boutons', 'Poche poitrine'],
  },
  {
    id: 'jogging',
    label: 'Jogging',
    category: 'bas',
    base: null,
    pieces: ['Ceinture élastique', 'Cordon de serrage', 'Jambes', 'Bords-côtes des chevilles', 'Poches', 'Coutures'],
  },
  {
    id: 'pantalon_cargo',
    label: 'Pantalon cargo',
    category: 'bas',
    base: null,
    pieces: ['Ceinture', 'Passants', 'Jambes', 'Poches cargo', 'Braguette', 'Coutures'],
  },
  {
    id: 'gant_boxe',
    label: 'Gant de boxe',
    category: 'equipement',
    base: 'gear',
    pieces: zoneLabels('gear'),
  },
  {
    id: 'protege_tibia',
    label: 'Protège-tibias',
    category: 'equipement',
    base: null,
    pieces: ['Coque', 'Sangles', 'Rembourrage', 'Fermetures'],
  },
];

export function garmentEntry(id: string): GarmentEntry | undefined {
  return GARMENTS.find((item) => item.id === id);
}

/** Vêtement du catalogue affiché : celui enregistré dans la spec, sinon la base du type. */
export function garmentKindOf(spec: StudioSpec, type: 'apparel' | 'gear'): string {
  return spec.garment?.kind ?? (type === 'apparel' ? 'gilet_zippe' : 'gant_boxe');
}

export function garmentName(spec: StudioSpec, type: 'apparel' | 'gear'): string {
  return garmentEntry(garmentKindOf(spec, type))?.label ?? BASES[type].name;
}
