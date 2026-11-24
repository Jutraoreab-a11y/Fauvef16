import type { HexColor, ProductType, SpecsTable } from '@/types/famal-spec';
import { BASES, COLORS, KEYWORDS, MATERIALS, MATERIAL_TERMS, ZONE_ALIASES } from './data';
import type { CommandPatch, StudioSpec, StudioZone } from './types';

export function createInitialSpec(type: ProductType): StudioSpec {
  const base = BASES[type];
  return {
    zones: base.zones.map((zone) => ({ ...zone })),
    sliders: base.sliders.map((slider) => ({ ...slider })),
  };
}

export function specsTableRows(specs: SpecsTable): [string, string][] {
  if ('fabric_weight_gsm' in specs) {
    return [
      ['Tailles', specs.sizes.join(' / ')],
      ['Fermeture', specs.closure],
      ['Matière de référence', `Molleton ${specs.fabric_weight_gsm} g/m²`],
    ];
  }

  return [
    ['Poids', specs.weights_oz.map((weight) => `${weight} oz`).join(' / ')],
    ['Rembourrage', specs.padding],
    ['Fermeture', specs.closure],
  ];
}

export function dominantColors(image: HTMLImageElement): HexColor[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Impossible de créer le canevas pour analyser la photo.');
  }

  context.drawImage(image, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const bins = new Map<string, { count: number; color: number[] }>();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;

    const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const luminance = (color[0] + color[1] + color[2]) / 3;
    if (luminance > 235 || luminance < 25) continue;

    const keyColor = color.map((value) => Math.min(255, Math.round(value / 32) * 32));
    const key = keyColor.join(',');
    const entry = bins.get(key) ?? { count: 0, color: keyColor };
    entry.count += 1;
    bins.set(key, entry);
  }

  return [...bins.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 2)
    .map(({ color }): HexColor => `#${color.map((value) => value.toString(16).padStart(2, '0')).join('')}`);
}

function commandMatcher(): {
  expression: RegExp;
  terms: Map<string, { kind: string; value: string | { name: string; hex: HexColor } }>;
} {
  const terms = new Map<
    string,
    { kind: string; value: string | { name: string; hex: HexColor } }
  >();
  const add = (
    term: string,
    kind: string,
    value: string | { name: string; hex: HexColor },
  ) => {
    const normalized = term.toLowerCase();
    if (!terms.has(normalized)) terms.set(normalized, { kind, value });
  };

  Object.entries(ZONE_ALIASES).forEach(([id, aliases]) => {
    aliases.forEach((alias) => add(alias, 'zone', id));
  });
  COLORS.forEach(([name, hex]) => add(name, 'color', { name, hex }));
  MATERIAL_TERMS.forEach(([term, material]) => add(term, 'material', material));
  KEYWORDS.forEach(([term, kind]) => add(term, kind, kind));

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alternatives = [...terms.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);

  return {
    expression: new RegExp(`(?<!\\p{L})(${alternatives.join('|')})(?!\\p{L})`, 'giu'),
    terms,
  };
}

const MATCHER = commandMatcher();

export function parseCommand(
  text: string,
  type: ProductType,
  zones: StudioZone[],
): CommandPatch[] {
  const validZones = new Set(zones.map((zone) => zone.id));
  const hits = [...text.toLowerCase().matchAll(MATCHER.expression)]
    .map((match) => MATCHER.terms.get(match[1].toLowerCase()))
    .filter((term): term is NonNullable<typeof term> => term !== undefined);
  const patches: CommandPatch[] = [];
  let zone: string | null = null;
  let colorDone = false;
  let pendingPatch = false;
  let pendingRaise = false;

  hits.forEach(({ kind, value }) => {
    if (kind === 'zone') {
      if (typeof value !== 'string' || !validZones.has(value)) return;
      zone = value;
      colorDone = false;
      if (pendingPatch) {
        patches.push({ op: 'add_patch', zone });
        pendingPatch = false;
      }
      if (pendingRaise && zone === 'col') {
        patches.push({ op: 'slider', id: 'col_hauteur', delta: 20 });
        pendingRaise = false;
      }
    } else if (kind === 'color') {
      if (zone && !colorDone && typeof value !== 'string') {
        patches.push({ op: 'set_color', zone, hex: value.hex, label: value.name });
        colorDone = true;
      }
    } else if (kind === 'material') {
      if (zone && typeof value === 'string') {
        const material = MATERIALS.find((preset) => preset === value);
        if (material) patches.push({ op: 'set_material', zone, material });
      }
    } else if (kind === 'patch') {
      pendingPatch = true;
    } else if (kind === 'boxy' && type === 'apparel') {
      patches.push({ op: 'slider', id: 'boxy', delta: 20 });
    } else if (kind === 'raise') {
      pendingRaise = true;
    } else if (kind === 'pad' && type === 'gear') {
      patches.push({ op: 'slider', id: 'rembourrage', delta: 15 });
    }
  });

  if (pendingPatch && zone) patches.push({ op: 'add_patch', zone });
  return patches;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
