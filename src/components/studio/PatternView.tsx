'use client';

import type { ProductType } from '@/types/famal-spec';
import { PATTERNS, PATTERN_VIEWBOX } from './patterns';
import type { StudioSpec } from './types';

interface PatternViewProps {
  type: ProductType;
  spec: StudioSpec;
  selected: string | null;
  onSelect: (id: string) => void;
}

/** Vue « patron à plat » : chaque pièce est colorée avec la couleur de sa zone et sélectionne la zone au clic. */
export default function PatternView({ type, spec, selected, onSelect }: PatternViewProps) {
  const pieces = PATTERNS[type];
  const zones = spec.zones;

  return (
    <div className="pattern-box" style={{ flex: '0 0 360px', minWidth: 280, padding: 16, overflowY: 'auto' }}>
      <p className="eyebrow">Patron à plat</p>
      <svg viewBox={PATTERN_VIEWBOX} role="img" aria-label="Patron à plat du vêtement" style={{ width: '100%', height: 'auto' }}>
        {pieces.map((piece, index) => {
          const zone = zones.find((item) => item.id === piece.zone);
          const isSelected = selected === piece.zone;
          const common = {
            d: piece.d,
            onClick: () => onSelect(piece.zone),
            style: { cursor: 'pointer' },
          };
          if (piece.kind === 'stroke') {
            return <path key={index} {...common} fill="none" stroke={zone?.hex ?? '#888'} strokeWidth={6} />;
          }
          if (piece.kind === 'dash') {
            return (
              <path
                key={index}
                {...common}
                fill="none"
                stroke={zone?.hex ?? '#888'}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray="8 6"
              />
            );
          }
          return (
            <path
              key={index}
              {...common}
              fill={zone?.hex ?? '#888'}
              stroke={isSelected ? '#F5C542' : '#1a1a1a'}
              strokeWidth={isSelected ? 3 : 1.2}
            />
          );
        })}
      </svg>
      <ul className="piece-list">
        {zones.map((zone) => (
          <li key={zone.id}>
            <button type="button" className={selected === zone.id ? 'active' : ''} onClick={() => onSelect(zone.id)}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: zone.hex, marginRight: 6 }} />
              {zone.label} · {zone.material}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
