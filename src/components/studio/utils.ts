import type { HexColor, ProductType, SpecsTable } from '@/types/famal-spec';
import { BASES, COLORS, KEYWORDS, MATERIALS, MATERIAL_TERMS, ZONE_ALIASES } from './data';
import { defaultGarmentOptions, pocketDefaults } from './garment-options';
import { garmentEntry } from './catalogue';
import type { ClosureFinish, ClosureType, CollarStyle, PocketFormat, PocketLevel, PocketSide } from './garment-options';
import type { MaterialPreset } from '@/types/famal-spec';
import type { CommandPatch, StudioSpec, StudioZone } from './types';

export function createInitialSpec(type: ProductType): StudioSpec {
  const base = BASES[type];
  return {
    zones: base.zones.map((zone) => ({ ...zone })),
    sliders: base.sliders.map((slider) => ({ ...slider })),
    garment: type === 'apparel' ? defaultGarmentOptions() : undefined,
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

/** Texte en minuscules, sans accents ni tirets : « Bord-côte » → « bord cote ». */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-']/g, ' ');
}

/**
 * Commandes de construction du gilet : style de col, ajout / retrait / format / position des poches.
 * Les couleurs et matières restent gérées par `parseCommand`.
 */
export function parseGarmentCommand(text: string): CommandPatch[] {
  const t = ` ${normalize(text)} `;
  const has = (pattern: RegExp) => pattern.test(t);
  const patches: CommandPatch[] = [];
  const removing = has(/\b(enleve|enlever|supprime|supprimer|retire|retirer|sans)\b/);

  // Col
  let collar: CollarStyle | null = null;
  if (has(/\bcapuche\b/)) collar = removing ? 'montant' : 'capuche';
  else if (has(/\bcol rond\b|\bcol ras du cou\b/)) collar = 'rond';
  else if (has(/\bcol (en )?bords? cotes?\b/)) collar = 'bord_cote';
  else if (has(/\bcol montant\b|\bcol droit\b/)) collar = 'montant';
  if (collar) patches.push({ op: 'set_collar', style: collar });

  // Fermeture
  let closure: ClosureType | null = null;
  if (has(/\bdemi ?zip\b|\bquart de zip\b|\bzip court\b/)) closure = 'demi_zip';
  else if (has(/\bsans (fermeture|zip)\b|\b(enleve|enlever|supprime|retire) (le |la )?(zip|fermeture)\b/)) closure = 'aucune';
  else if (has(/\bzip complet\b|\bzip (en )?entier\b|\b(remets|mets|met) (un |le )?zip\b/)) closure = 'zip';
  else if (has(/\b(fermeture|ferme) (a |avec des |par )?(boutons|pressions)\b|\b(avec|en) (des )?boutons\b|\bzip par des (boutons|pressions)\b|\bboutonnee?\b/)) closure = 'boutons';
  if (closure) patches.push({ op: 'set_closure', closure });

  let finish: ClosureFinish | null = null;
  if (has(/\bassortie?s?\b|\bton sur ton\b|\bmeme couleur que le (tissu|corps)\b/)) finish = 'assorti';
  else if (has(/\b(finition|zip|boutons|fermeture) (en )?metal\b|\bmetallique\b/)) finish = 'metal';
  if (finish) patches.push({ op: 'set_finish', finish });

  // Poches (on ignore les demandes de patch ou logo « sur les poches »)
  const aboutPockets = has(/\bpoches?\b|\bkangourou\b/) && !has(/\b(patch|logo|broderie|etiquette)\b/);
  if (!aboutPockets) return patches;

  let format: PocketFormat | undefined;
  if (has(/\bkangourou\b/)) format = 'kangourou';
  else if (has(/\bpoches? (de )?poitrine\b/)) format = 'poitrine';
  else if (has(/\bpasse ?poil|\blaterales?\b|\bpoches? (en )?biais\b/)) format = 'passepoilee';
  else if (has(/\bplaquees?\b/)) format = 'plaquee';

  let side: PocketSide | undefined;
  if (has(/\b(deux cotes|chaque cote|les deux|double|deux poches)\b/)) side = 'double';
  else if (has(/\bgauche\b/)) side = 'gauche';
  else if (has(/\bdroite\b/)) side = 'droite';
  else if (has(/\b(centre|centree|centrees|milieu devant)\b/)) side = 'centre';

  let level: PocketLevel | undefined;
  if (has(/\b(en haut|plus haut|remonte|remonter|monte)\b/) || (has(/\bpoitrine\b/) && format !== 'poitrine')) level = 'poitrine';
  else if (has(/\bau milieu\b|\bmi hauteur\b/)) level = 'milieu';
  else if (has(/\b(en bas|plus bas|descend|descendre|baisse|baisser)\b/)) level = 'bas';

  if (removing) {
    patches.push({ op: 'remove_pockets' });
  } else if (has(/\b(masque|masquer|cache|cacher)\b/)) {
    patches.push({ op: 'show_pockets', visible: false });
  } else if (has(/\b(ajoute|ajouter|rajoute|rajouter|mets une|met une|ajout)\b/)) {
    const chosen = format ?? 'plaquee';
    const defaults = pocketDefaults(chosen);
    patches.push({
      op: 'add_pocket',
      format: chosen,
      side: side ?? defaults.side ?? (chosen === 'poitrine' ? 'gauche' : 'double'),
      level: level ?? defaults.level ?? 'bas',
    });
  } else if (has(/\b(affiche|afficher|montre|montrer|remets)\b/)) {
    patches.push({ op: 'show_pockets', visible: true });
  } else if (format || side || level) {
    patches.push({ op: 'update_pockets', format, side, level });
  }
  return patches;
}

/**
 * Finition de la fermeture : colore le zip et les boutons.
 * « Assorti au tissu » reprend la couleur du corps (et la suit quand le corps change).
 */
export function applyFinish(spec: StudioSpec, finish: ClosureFinish): StudioSpec {
  const body = spec.zones.find((zone) => zone.id === 'corps');
  const look = (id: string): { hex: HexColor; material: MaterialPreset } | null => {
    if (finish === 'metal') return { hex: id === 'zip' ? '#9AA3AD' : '#C9C3B6', material: 'métal' };
    if (finish === 'noir_mat') return { hex: '#15171A', material: 'résine mate' };
    return body ? { hex: body.hex, material: 'résine mate' } : null;
  };
  return {
    ...spec,
    zones: spec.zones.map((zone) => {
      if (zone.id !== 'zip' && zone.id !== 'boutons') return zone;
      const next = look(zone.id);
      return next ? { ...zone, ...next } : zone;
    }),
  };
}

const FABRICS: MaterialPreset[] = ['molleton', 'maille épaisse', 'coton lourd', 'microfibre haute densité', 'cuir mat', 'cuir brillant'];

/** Matières proposées pour une pièce : on ne propose pas du métal pour une manche ni du molleton pour un zip. */
export function materialsFor(zoneId: string): MaterialPreset[] {
  switch (zoneId) {
    case 'zip':
      return ['métal', 'résine mate'];
    case 'boutons':
      return ['métal', 'résine mate', 'cuir mat'];
    case 'couture':
      return ['coton lourd', 'microfibre haute densité'];
    case 'bords':
      return ['maille épaisse', 'molleton', 'coton lourd'];
    case 'corps':
    case 'manches':
    case 'col':
    case 'poches':
      return FABRICS;
    default:
      return [...MATERIALS];
  }
}

/**
 * Applique un vêtement du catalogue sur la base 3D : col, fermeture, poches, proportions et noms des zones.
 * Les couleurs et matières déjà choisies sont gardées.
 */
export function applyGarmentPreset(spec: StudioSpec, kind: string): StudioSpec {
  const entry = garmentEntry(kind);
  if (!entry?.base || entry.base !== 'apparel') return spec;
  const preset = entry.preset ?? { options: {} };
  const base = BASES.apparel;
  const sliders = base.sliders.map((slider) => ({
    ...slider,
    value: preset.sliders?.[slider.id] ?? slider.value,
  }));
  const zones = base.zones.map((zone) => {
    const current = spec.zones.find((item) => item.id === zone.id);
    return {
      ...zone,
      ...(current ? { hex: current.hex, material: current.material } : {}),
      label: preset.zoneLabels?.[zone.id] ?? zone.label,
    };
  });
  const garment = {
    ...defaultGarmentOptions(),
    ...preset.options,
    pockets: (preset.options.pockets ?? defaultGarmentOptions().pockets).map((pocket) => ({ ...pocket })),
    kind,
  };
  // Sweat, t-shirt… : coutures ton sur ton, comme sur un vrai vêtement en maille.
  if (kind !== 'gilet_zippe') {
    const body = zones.find((zone) => zone.id === 'corps');
    const seam = zones.find((zone) => zone.id === 'couture');
    if (body && seam) seam.hex = tonalSeam(body.hex);
  }
  const next: StudioSpec = { zones, sliders, garment };
  return garment.finish === 'assorti' ? applyFinish(next, 'assorti') : next;
}

/** Zones réellement présentes : pas de « Zip » sur un sweat sans fermeture, par exemple. */
export function zoneInUse(spec: StudioSpec, zoneId: string): boolean {
  const garment = spec.garment;
  if (!garment) return true;
  const pockets = garment.pockets.filter((pocket) => pocket.visible);
  if (zoneId === 'zip') return garment.closure === 'zip' || garment.closure === 'demi_zip';
  if (zoneId === 'poches') return pockets.length > 0;
  if (zoneId === 'boutons') {
    return garment.closure === 'boutons'
      || garment.collar === 'montant'
      || pockets.some((pocket) => pocket.format === 'plaquee' || pocket.format === 'poitrine');
  }
  return true;
}

/** Parts de couleur d'une photo (fond clair et noirs ignorés), de la plus présente à la moins présente. */
export function colorShares(image: HTMLImageElement): { hex: HexColor; share: number }[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Impossible de créer le canevas pour analyser la photo.');
  context.drawImage(image, 0, 0, 48, 48);
  const pixels = context.getImageData(0, 0, 48, 48).data;
  const bins = new Map<string, { count: number; sum: number[] }>();
  let total = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;
    const color = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const luminance = (color[0] + color[1] + color[2]) / 3;
    if (luminance > 235 || luminance < 25) continue;
    const key = color.map((value) => Math.round(value / 32)).join(',');
    const entry = bins.get(key) ?? { count: 0, sum: [0, 0, 0] };
    entry.count += 1;
    entry.sum = entry.sum.map((value, channel) => value + color[channel]);
    bins.set(key, entry);
    total += 1;
  }
  return [...bins.values()]
    .sort((left, right) => right.count - left.count)
    .map(({ count, sum }) => ({
      // Couleur moyenne du groupe (plus fidèle que le centre de la case).
      hex: `#${sum.map((value) => Math.round(value / count).toString(16).padStart(2, '0')).join('')}` as HexColor,
      share: total ? count / total : 0,
    }));
}

/** Couleur de fil ton sur ton : la couleur du tissu, un peu plus sombre. */
export function tonalSeam(hex: HexColor): HexColor {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * 0.8);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}` as HexColor;
}
