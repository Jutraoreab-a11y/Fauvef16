import type {
  AssetType,
  HexColor,
  LogoPlacement,
  MaterialPreset,
  ProductType,
  SliderSpec,
  SpecsTable,
  ZoneSpec,
} from '@/types/famal-spec';

export type StudioZone = ZoneSpec<string>;

export interface StudioSpec {
  zones: StudioZone[];
  sliders: SliderSpec[];
}

export type StudioAssetKind = Exclude<AssetType, 'texture' | 'render'>;

export interface StudioAsset extends LogoPlacement {
  id: string;
  name: string;
  kind: StudioAssetKind;
  image: HTMLImageElement | null;
}

export type StudioView = 'face' | 'dos' | 'g34' | 'd34' | 'detail';
export type StudioContext = 'isolated' | 'mannequin';
export type PipelineStepState = 'waiting' | 'running' | 'done';
export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  text: string;
  pre?: string;
}

export type CommandPatch =
  | { op: 'set_color'; zone: string; hex: HexColor; label: string }
  | { op: 'set_material'; zone: string; material: MaterialPreset }
  | { op: 'slider'; id: string; delta: number }
  | { op: 'add_patch'; zone: string };

export interface StudioBase {
  name: string;
  category: string;
  zones: StudioZone[];
  sliders: SliderSpec[];
  specsTable: SpecsTable;
}

export interface StudioSnapshot {
  type: ProductType;
  view: StudioView;
  context: StudioContext;
  selected: string | null;
  spec: StudioSpec;
  assets: StudioAsset[];
  image: HTMLImageElement | null;
  lightTheme: boolean;
}
