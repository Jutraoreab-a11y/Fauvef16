'use client';

import { useEffect, useRef } from 'react';
import type { HexColor } from '@/types/famal-spec';
import { COLORS, MATERIALS } from './data';
import {
  COLLAR_STYLES,
  MAX_POCKETS,
  POCKET_FORMATS,
  POCKET_LEVELS,
  POCKET_SIDES,
  newPocketId,
  pocketDefaults,
  type GarmentOptions,
  type PocketSpec,
} from './garment-options';
import type { StudioSpec } from './types';

interface ComponentEditorsProps {
  spec: StudioSpec;
  selected: string | null;
  onSelectZone: (id: string) => void;
  onGarmentChange: (update: (current: GarmentOptions) => GarmentOptions) => void;
  onColorChange: (id: string, value: HexColor) => void;
  onMaterialChange: (id: string, material: (typeof MATERIALS)[number]) => void;
  onSliderChange: (id: string, value: number) => void;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="opt-row">
      <span className="opt-label">{label}</span>
      <div className="seg opt-seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={value === option.id ? 'active' : ''}
            aria-pressed={value === option.id}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Couleur (palette rapide + sélecteur) et matière d'une zone. */
function ColorMaterial({
  zoneId,
  spec,
  onColorChange,
  onMaterialChange,
}: Pick<ComponentEditorsProps, 'spec' | 'onColorChange' | 'onMaterialChange'> & { zoneId: string }) {
  const zone = spec.zones.find((item) => item.id === zoneId);
  if (!zone) return null;
  return (
    <>
      <div className="opt-row">
        <span className="opt-label">Couleur</span>
        <div className="palette">
          {COLORS.map(([name, hex]) => (
            <button
              type="button"
              key={name}
              title={name}
              aria-label={`${zone.label} en ${name}`}
              className={zone.hex.toLowerCase() === hex.toLowerCase() ? 'active' : ''}
              style={{ background: hex }}
              onClick={() => onColorChange(zone.id, hex)}
            />
          ))}
          <input
            type="color"
            value={zone.hex}
            aria-label={`Autre couleur pour ${zone.label}`}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (/^#[0-9a-f]{6}$/i.test(value)) onColorChange(zone.id, value as HexColor);
            }}
          />
        </div>
      </div>
      <div className="opt-row">
        <span className="opt-label">Matière</span>
        <select
          value={zone.material}
          aria-label={`Matière ${zone.label}`}
          onChange={(event) => {
            const material = MATERIALS.find((preset) => preset === event.currentTarget.value);
            if (material) onMaterialChange(zone.id, material);
          }}
        >
          {MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}
        </select>
      </div>
    </>
  );
}

function PocketCard({
  pocket,
  index,
  onChange,
  onRemove,
}: {
  pocket: PocketSpec;
  index: number;
  onChange: (patch: Partial<PocketSpec>) => void;
  onRemove: () => void;
}) {
  const centred = pocket.format === 'kangourou';
  return (
    <div className={`pocket-card${pocket.visible ? '' : ' hidden-pocket'}`}>
      <div className="asset-head">
        <strong>Poche {index + 1}</strong>
        <span>
          <button className="linkbtn" type="button" onClick={() => onChange({ visible: !pocket.visible })}>
            {pocket.visible ? 'Masquer' : 'Afficher'}
          </button>
          {' · '}
          <button className="linkbtn" type="button" onClick={onRemove}>Retirer</button>
        </span>
      </div>
      <Segmented
        label="Format"
        options={POCKET_FORMATS}
        value={pocket.format}
        onChange={(format) => onChange({ format, ...pocketDefaults(format) })}
      />
      <Segmented
        label="Côté"
        options={POCKET_SIDES}
        value={centred ? 'centre' : pocket.side}
        disabled={centred}
        onChange={(side) => onChange({ side })}
      />
      <Segmented label="Hauteur" options={POCKET_LEVELS} value={pocket.level} onChange={(level) => onChange({ level })} />
      <div className="slider">
        <label htmlFor={`pocket-offset-${pocket.id}`}>
          <span>Décalage {pocket.side === 'double' && !centred ? '(écartement)' : ''}</span>
          <span>{Math.round(pocket.offset * 100)}</span>
        </label>
        <input
          id={`pocket-offset-${pocket.id}`}
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={pocket.offset}
          onChange={(event) => onChange({ offset: Number(event.currentTarget.value) })}
        />
      </div>
    </div>
  );
}

/** Réglages directs du col et des poches ; s'ouvrent quand on clique la zone dans la 3D ou le patron. */
export function ComponentEditors({
  spec,
  selected,
  onSelectZone,
  onGarmentChange,
  onColorChange,
  onMaterialChange,
  onSliderChange,
}: ComponentEditorsProps) {
  const collarRef = useRef<HTMLDivElement>(null);
  const pocketsRef = useRef<HTMLDivElement>(null);
  const garment = spec.garment;

  useEffect(() => {
    const target = selected === 'col' ? collarRef.current : selected === 'poches' ? pocketsRef.current : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  if (!garment) return null;
  const collarHeight = spec.sliders.find((slider) => slider.id === 'col_hauteur');

  const updatePocket = (id: string, patch: Partial<PocketSpec>) => onGarmentChange((current) => ({
    ...current,
    pockets: current.pockets.map((pocket) => (pocket.id === id ? { ...pocket, ...patch } : pocket)),
  }));

  return (
    <section className="block">
      <h2>Col et poches</h2>

      <div ref={collarRef} className={`component${selected === 'col' ? ' sel' : ''}`}>
        <button className="zone-head" type="button" onClick={() => onSelectZone('col')}>
          <strong>Col</strong>
        </button>
        <Segmented
          label="Style"
          options={COLLAR_STYLES}
          value={garment.collar}
          onChange={(collar) => onGarmentChange((current) => ({ ...current, collar }))}
        />
        {collarHeight && garment.collar !== 'capuche' && (
          <div className="slider">
            <label htmlFor="collar-height">
              <span>Hauteur</span>
              <span>{collarHeight.value}</span>
            </label>
            <input
              id="collar-height"
              type="range"
              min={collarHeight.min}
              max={collarHeight.max}
              value={collarHeight.value}
              onChange={(event) => onSliderChange('col_hauteur', Number(event.currentTarget.value))}
            />
          </div>
        )}
        <ColorMaterial zoneId="col" spec={spec} onColorChange={onColorChange} onMaterialChange={onMaterialChange} />
      </div>

      <div ref={pocketsRef} className={`component${selected === 'poches' ? ' sel' : ''}`}>
        <button className="zone-head" type="button" onClick={() => onSelectZone('poches')}>
          <strong>Poches</strong>
          <span className="muted">{garment.pockets.filter((pocket) => pocket.visible).length} affichée(s)</span>
        </button>
        <ColorMaterial zoneId="poches" spec={spec} onColorChange={onColorChange} onMaterialChange={onMaterialChange} />
        {garment.pockets.map((pocket, index) => (
          <PocketCard
            key={pocket.id}
            pocket={pocket}
            index={index}
            onChange={(patch) => updatePocket(pocket.id, patch)}
            onRemove={() => onGarmentChange((current) => ({
              ...current,
              pockets: current.pockets.filter((item) => item.id !== pocket.id),
            }))}
          />
        ))}
        <button
          className="btn ghost full"
          type="button"
          disabled={garment.pockets.length >= MAX_POCKETS}
          onClick={() => onGarmentChange((current) => ({
            ...current,
            pockets: [
              ...current.pockets,
              { id: newPocketId(), format: 'poitrine', side: 'gauche', level: 'poitrine', offset: 0, visible: true },
            ],
          }))}
        >
          {garment.pockets.length >= MAX_POCKETS ? `${MAX_POCKETS} poches au maximum` : '+ Ajouter une poche'}
        </button>
      </div>
    </section>
  );
}
