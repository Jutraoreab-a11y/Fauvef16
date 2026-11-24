// Schemas polymorphiques ProductSpec : ApparelSpec (vetements) et GearSpec (equipements).
// Le discriminant est product_type ; il correspond a famal_projects.product_type.

export type ProductType = 'apparel' | 'gear';

export type HexColor = `#${string}`;

export type MaterialPreset =
  | 'molleton'
  | 'maille épaisse'
  | 'coton lourd'
  | 'cuir mat'
  | 'cuir brillant'
  | 'microfibre haute densité'
  | 'métal';

export interface LogoPlacement {
  x: number; // position relative à la zone, de -0.5 à 0.5
  y: number;
  size: number; // taille relative, de 0.05 à 0.4
}

export interface ZoneSpec<Id extends string> {
  id: Id;
  label: string;
  hex: HexColor;
  material: MaterialPreset;
}

export interface SliderSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
}

// ---------------------------------------------------------------------------
// Vetements : gilets zippes, sweats, vestes, t-shirts
// ---------------------------------------------------------------------------

export type ApparelZoneId = 'corps' | 'manches' | 'col' | 'bords_cotes' | 'zip';

export type ApparelCategory = 'gilet' | 'sweat' | 'veste' | 'tshirt';

export interface ApparelSpec {
  product_type: 'apparel';
  category: ApparelCategory;
  zones: ZoneSpec<ApparelZoneId>[];
  sliders: SliderSpec[]; // ex. boxy, longueur, hauteur_col
  logos: ApparelLogo[];
}

export interface ApparelLogo {
  id: string;
  kind: 'logo' | 'patch' | 'label';
  zone: ApparelZoneId;
  placement: LogoPlacement;
}

export interface ApparelSpecsTable {
  sizes: ('S' | 'M' | 'L' | 'XL')[];
  fabric_weight_gsm: number;
  closure: string;
}

// ---------------------------------------------------------------------------
// Equipements : gants de boxe, protections, accessoires de marque
// ---------------------------------------------------------------------------

export type GearZoneId = 'coque' | 'pouce' | 'paume' | 'manchette';

export type GearCategory = 'gant_boxe' | 'protection' | 'accessoire';

export interface GearSpec {
  product_type: 'gear';
  category: GearCategory;
  zones: ZoneSpec<GearZoneId>[];
  sliders: SliderSpec[]; // ex. rembourrage, longueur_manchette
  logos: GearLogo[];
}

export interface GearLogo {
  id: string;
  kind: 'logo' | 'patch' | 'label';
  zone: GearZoneId;
  placement: LogoPlacement;
}

export interface GearSpecsTable {
  weights_oz: (12 | 14 | 16)[];
  padding: string;
  closure: string;
}

// ---------------------------------------------------------------------------
// Polymorphisme et enregistrements Supabase
// ---------------------------------------------------------------------------

export type ProductSpec = ApparelSpec | GearSpec;

export type SpecsTable = ApparelSpecsTable | GearSpecsTable;

export type AssetType = 'logo' | 'patch' | 'label' | 'texture' | 'render';

export interface FamalProjectRow {
  id: string;
  user_id: string;
  brand_name: string;
  project_name: string;
  product_type: ProductType;
  category: string;
  source_image_url: string | null;
  cleaned_image_url: string | null;
  product_spec_json: ProductSpec | Record<string, never>;
  specs_table_json: SpecsTable | Record<string, never>;
  created_at: string;
  updated_at: string;
}

export interface FamalAssetRow {
  id: string;
  project_id: string;
  asset_type: AssetType;
  file_url: string;
  placement_json: LogoPlacement | Record<string, never>;
  created_at: string;
}

export interface FamalBaseModelRow {
  id: string;
  name: string;
  product_type: ProductType;
  category: string;
  glb_url: string;
  zones_schema_json: ZoneSpec<string>[];
  default_specs_table_json: SpecsTable;
  created_at: string;
}

// Garde de type : permet de traiter un ProductSpec selon son discriminant.
export function isApparelSpec(spec: ProductSpec): spec is ApparelSpec {
  return spec.product_type === 'apparel';
}

export function isGearSpec(spec: ProductSpec): spec is GearSpec {
  return spec.product_type === 'gear';
}
