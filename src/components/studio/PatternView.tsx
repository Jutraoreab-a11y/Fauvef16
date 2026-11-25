'use client';

import type { ProductType } from '@/types/famal-spec';
import { PATTERNS, PATTERN_VIEWBOX, apparelPattern } from './patterns';
import type { StudioSpec } from './types';

interface PatternViewProps {
  type: ProductType;
  spec: StudioSpec;
  selected: string | null;
  onSelect: (id: string) => void;
}

/** Vue « patron à plat » : chaque pièce est colorée avec la couleur de sa zone et sélectionne la zone au clic. */
export default function PatternView({ type, spec, selected, onSelect }: PatternViewProps) {
  const pieces = type === 'apparel' ? apparelPattern(spec) : PATTERNS[type];
  const zones = spec.zones;

  return (
    <div className="pattern-box" style={{ flex: '0 0 360px', minWidth: 280, padding: 16, overflowY: 'auto', background: '#cdcdcd' }}>
      <p className="eyebrow">Patron à plat</p>
      <svg viewBox={PATTERN_VIEWBOX} role="img" aria-label="Patron à plat du vêtement" style={{ width: '100%', height: 'auto' }}>
        <defs>
          <pattern id="patron-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 L0 0 0 20" fill="none" stroke="#b4b4b4" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="520" height="600" fill="#cdcdcd" />
        <rect x="0" y="0" width="520" height="600" fill="url(#patron-grid)" />
        <g fill="#b9b9b9" opacity="0.7" pointerEvents="none">
          <circle cx="260" cy="60" r="38" />
          <path d="M200,110 L320,110 L350,260 L340,560 L300,560 L290,380 L230,380 L220,560 L180,560 L170,260 Z" />
        </g>
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
              fillRule={piece.evenOdd ? 'evenodd' : undefined}
              fill={zone?.hex ?? '#888'}
              stroke={isSelected ? '#F5C542' : '#1f1f1f'}
              strokeWidth={isSelected ? 3 : 1.4}
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
