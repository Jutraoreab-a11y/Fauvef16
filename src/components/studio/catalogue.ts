import type { ProductType } from '@/types/famal-spec';
import { BASES } from './data';

export type GarmentCategory = 'haut' | 'bas' | 'manteau' | 'equipement';

export interface GarmentEntry {
  id: string;
  label: string;
  category: GarmentCategory;
  /** Base 3D déjà disponible dans le studio, sinon null (modèle à créer). */
  base: ProductType | null;
  /** Pièces connues pour ce vêtement. */
  pieces: string[];
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
  },
  {
    id: 'sweat_capuche',
    label: 'Sweat à capuche',
    category: 'haut',
    base: null,
    pieces: ['Capuche', 'Cordon de capuche', 'Corps', 'Manches', 'Bords-côtes', 'Poche kangourou', 'Coutures apparentes'],
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
