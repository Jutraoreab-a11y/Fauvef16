'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductType } from '@/types/famal-spec';
import { PATTERNS, PATTERN_VIEWBOX } from './patterns';
import {
  boxyFromSide,
  collarFromHeight,
  flatLayout,
  lengthFromHem,
  sleevesFromEnd,
} from './flat-pattern';
import { GARMENT_TOP, HALF_ZIP_BOTTOM, buttonHeights, defaultGarmentOptions } from './garment-options';
import type { StudioSpec } from './types';
import { zoneInUse } from './utils';

interface PatternViewProps {
  type: ProductType;
  spec: StudioSpec;
  selected: string | null;
  onSelect: (id: string) => void;
  onSliderChange: (id: string, value: number) => void;
}

type Point = [number, number];
type HandleId = 'hem' | 'side' | 'sleeve' | 'collar';

// Coordonnées SVG : x identique, y inversé (la scène 3D a y vers le haut).
const toSvg = ([x, y]: Point) => `${x.toFixed(3)},${(-y).toFixed(3)}`;
const polyPath = (points: Point[]) => `M${points.map(toSvg).join(' L')} Z`;

function textColor(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b1a18' : '#f4f1ec';
}

const HANDLE_HELP: Record<HandleId, string> = {
  hem: 'Glisser : longueur du vêtement',
  side: 'Glisser : ampleur',
  sleeve: 'Glisser : longueur des manches',
  collar: 'Glisser : hauteur du col',
};

/**
 * Patron éclaté posé sur le mannequin : chaque pièce est séparée, à sa hauteur réelle sur le corps.
 * Les poignées rondes modifient directement le vêtement (longueur, ampleur, manches, col) ; la 3D suit.
 */
function ApparelPattern({ spec, selected, onSelect, onSliderChange }: Omit<PatternViewProps, 'type'>) {
  const layout = useMemo(() => flatLayout(spec), [spec]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<HandleId | null>(null);
  // La poignée en cours est aussi gardée dans une ref : les mouvements rapides arrivent avant le rendu suivant.
  const draggingRef = useRef<HandleId | null>(null);
  const startDrag = (id: HandleId | null) => {
    draggingRef.current = id;
    setDragging(id);
  };
  const zones = spec.zones;
  const hexOf = (zone: string) => zones.find((item) => item.id === zone)?.hex ?? '#888888';
  const raw = Object.fromEntries(spec.sliders.map(({ id, value }) => [id, value]));
  const options = spec.garment ?? defaultGarmentOptions();
  const { minX, maxX, minY, maxY } = layout.bounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const unit = width / 60; // épaisseurs et textes proportionnels à la taille du dessin

  const toWorld = (event: ReactPointerEvent<SVGElement>): Point | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return [local.x, -local.y];
  };

  const applyDrag = (handle: HandleId, [x, y]: Point) => {
    if (handle === 'hem') onSliderChange('longueur', lengthFromHem(y));
    else if (handle === 'side') onSliderChange('boxy', boxyFromSide(Math.abs(x), raw, options.closure === 'zip' ? 0.05 : 0));
    else if (handle === 'sleeve') {
      const { origin, direction, fullLength } = layout.handles.sleeve;
      const t = (x - origin[0]) * direction[0] + (y - origin[1]) * direction[1];
      onSliderChange('manches', sleevesFromEnd(t, fullLength));
    } else if (handle === 'collar' && layout.handles.collar) {
      onSliderChange('col_hauteur', collarFromHeight(options.collar, y - layout.handles.collar.base));
    }
  };

  const handles: { id: HandleId; point: Point }[] = [
    { id: 'hem', point: layout.handles.hem },
    { id: 'side', point: layout.handles.side },
    { id: 'sleeve', point: layout.handles.sleeve.point },
    ...(layout.handles.collar ? [{ id: 'collar' as const, point: layout.handles.collar.point }] : []),
  ];

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`${minX} ${-maxY} ${width} ${height}`}
        role="img"
        aria-label="Patron éclaté posé sur le mannequin"
        style={{ width: '100%', height: 'auto', touchAction: 'none' }}
        onPointerMove={(event) => {
          const active = draggingRef.current;
          if (!active) return;
          const world = toWorld(event);
          if (world) applyDrag(active, world);
        }}
        onPointerUp={() => startDrag(null)}
        onPointerLeave={() => startDrag(null)}
      >
        <defs>
          <pattern id="patron-grid" width="0.2" height="0.2" patternUnits="userSpaceOnUse">
            <path d="M0.2 0 L0 0 0 0.2" fill="none" stroke="#b4b4b4" strokeWidth={unit * 0.08} />
          </pattern>
        </defs>
        <rect x={minX} y={-maxY} width={width} height={height} fill="#cdcdcd" />
        <rect x={minX} y={-maxY} width={width} height={height} fill="url(#patron-grid)" />

        {/* Silhouette du mannequin */}
        <g fill="#b9b9b9" opacity="0.75" pointerEvents="none">
          <ellipse cx={layout.silhouette.head.cx} cy={-layout.silhouette.head.cy} rx={layout.silhouette.head.rx} ry={layout.silhouette.head.ry} />
          <path d={polyPath(layout.silhouette.neck)} />
          <path d={polyPath(layout.silhouette.torso)} />
          {layout.silhouette.arms.map((arm, index) => <path key={`arm-${index}`} d={polyPath(arm)} />)}
          {layout.silhouette.legs.map((leg, index) => <path key={`leg-${index}`} d={polyPath(leg)} />)}
        </g>

        {/* Niveaux du corps (traits derrière les pièces, noms par-dessus) */}
        <g pointerEvents="none">
          {layout.levels.map((level) => (
            <line
              key={level.label}
              x1={minX + unit * 0.5}
              x2={maxX}
              y1={-level.y}
              y2={-level.y}
              stroke="#8c8a85"
              strokeWidth={unit * 0.08}
              strokeDasharray={`${unit * 0.6} ${unit * 0.4}`}
            />
          ))}
        </g>

        {/* Vêtement porté, en transparence */}
        <g pointerEvents="none" opacity="0.28">
          {layout.worn.map((shape, index) => (
            <path key={`worn-${index}`} d={polyPath(shape.points)} fill={hexOf(shape.zone)} />
          ))}
        </g>

        {/* Pièces éclatées */}
        {[...layout.pieces.filter((piece) => !piece.overlay), ...layout.pieces.filter((piece) => piece.overlay)].map((piece) => {
          const hex = hexOf(piece.zone);
          const isSelected = selected === piece.zone;
          return (
            <g key={piece.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(piece.zone)}>
              {piece.points.map((points, index) => (
                <path
                  key={index}
                  d={polyPath(points)}
                  fill={hex}
                  stroke={isSelected ? '#F5C542' : '#1f1f1f'}
                  strokeWidth={unit * (isSelected ? 0.3 : 0.14)}
                  strokeLinejoin="round"
                />
              ))}
              {piece.label && (
                <text
                  x={piece.labelAt[0]}
                  y={-piece.labelAt[1]}
                  fontSize={unit * 1.05}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor(hex)}
                  pointerEvents="none"
                >
                  {piece.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Fermeture sur le devant : du bas (ou de la poitrine pour un demi-zip) à l'encolure */}
        {(options.closure === 'zip' || options.closure === 'demi_zip') && (
          <line
            x1={0}
            x2={0}
            y1={-(options.closure === 'demi_zip' ? HALF_ZIP_BOTTOM : layout.handles.hem[1] + 0.02)}
            y2={-(GARMENT_TOP - 0.16)}
            stroke={hexOf('zip')}
            strokeWidth={unit * 0.35}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect('zip')}
          />
        )}
        {options.closure === 'boutons' && (
          <g style={{ cursor: 'pointer' }} onClick={() => onSelect('boutons')}>
            {buttonHeights(layout.handles.hem[1], GARMENT_TOP - 0.005).map((y) => (
              <circle key={y} cx={0} cy={-y} r={0.045} fill={hexOf('boutons')} stroke="#1f1f1f" strokeWidth={unit * 0.1} />
            ))}
          </g>
        )}

        {/* Traits de rappel : fin de manche à plat → fin de manche portée */}
        <g pointerEvents="none">
          {layout.connectors.map(([from, to], index) => (
            <line
              key={`connector-${index}`}
              x1={from[0]}
              y1={-from[1]}
              x2={to[0]}
              y2={-to[1]}
              stroke="#5f5d58"
              strokeWidth={unit * 0.08}
              strokeDasharray={`${unit * 0.3} ${unit * 0.3}`}
            />
          ))}
        </g>

        <g pointerEvents="none">
          {layout.levels.map((level) => (
            <text
              key={`label-${level.label}`}
              x={minX + unit * 0.5}
              y={-level.y - unit * 0.35}
              fontSize={unit * 1.25}
              fill="#3d3b37"
              stroke="#e6e3de"
              strokeWidth={unit * 0.35}
              paintOrder="stroke"
            >
              {level.label}
            </text>
          ))}
        </g>

        {/* Poignées d'édition */}
        {handles.map((handle) => (
          <circle
            key={handle.id}
            cx={handle.point[0]}
            cy={-handle.point[1]}
            r={unit * (dragging === handle.id ? 0.95 : 0.75)}
            fill="#F5C542"
            stroke="#1f1f1f"
            strokeWidth={unit * 0.15}
            style={{ cursor: handle.id === 'side' ? 'ew-resize' : 'grab' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              startDrag(handle.id);
              try {
                (event.currentTarget as Element).setPointerCapture(event.pointerId);
              } catch {
                // Capture indisponible (pointeur déjà relâché) : le glisser marche quand même sur le dessin.
              }
            }}
          >
            <title>{HANDLE_HELP[handle.id]}</title>
          </circle>
        ))}
      </svg>

      <div className="pattern-readout">
        <span><strong>Longueur</strong> : {layout.readout.length}</span>
        <span><strong>Manches</strong> : s’arrêtent {layout.readout.sleeves}</span>
        <span className="muted">Poignées jaunes : glissez pour modifier le patron, la 3D suit.</span>
      </div>
    </>
  );
}

/** Vue « patron à plat » : chaque pièce est colorée avec la couleur de sa zone et sélectionne la zone au clic. */
export default function PatternView({ type, spec, selected, onSelect, onSliderChange }: PatternViewProps) {
  const zones = spec.zones;
  // Calculé dans le navigateur seulement : les décimales du serveur et du client diffèrent légèrement.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="pattern-box" style={{ flex: '0 0 44%', minWidth: 340, padding: 16, overflowY: 'auto', background: '#cdcdcd' }}>
      <p className="eyebrow">Patron éclaté · sur le mannequin</p>
      {type === 'apparel' ? (
        !mounted ? <div className="pattern-loading" /> : <ApparelPattern spec={spec} selected={selected} onSelect={onSelect} onSliderChange={onSliderChange} />
      ) : (
        <svg viewBox={PATTERN_VIEWBOX} role="img" aria-label="Patron à plat" style={{ width: '100%', height: 'auto' }}>
          <rect x="0" y="0" width="520" height="600" fill="#cdcdcd" />
          {PATTERNS.gear.map((piece, index) => {
            const zone = zones.find((item) => item.id === piece.zone);
            const isSelected = selected === piece.zone;
            return (
              <path
                key={index}
                d={piece.d}
                onClick={() => onSelect(piece.zone)}
                style={{ cursor: 'pointer' }}
                fill={piece.kind === 'dash' ? 'none' : zone?.hex ?? '#888'}
                stroke={piece.kind === 'dash' ? zone?.hex ?? '#888' : isSelected ? '#F5C542' : '#1f1f1f'}
                strokeWidth={piece.kind === 'dash' ? 2 : isSelected ? 3 : 1.4}
                strokeDasharray={piece.kind === 'dash' ? '8 6' : undefined}
              />
            );
          })}
        </svg>
      )}
      <ul className="piece-list">
        {zones.filter((zone) => zoneInUse(spec, zone.id)).map((zone) => (
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
