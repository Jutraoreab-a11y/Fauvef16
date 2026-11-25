'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import type { HexColor, ProductType } from '@/types/famal-spec';
import { CHIPS, MATERIALS } from './data';
import { GARMENTS, GARMENT_CATEGORIES } from './catalogue';
import { ComponentEditors } from './ComponentEditors';
import type { GarmentOptions } from './garment-options';
import type {
  ChatMessage,
  PipelineStepState,
  StudioAsset,
  StudioSpec,
} from './types';

interface LeftPanelProps {
  type: ProductType;
  spec: StudioSpec;
  selected: string | null;
  assets: StudioAsset[];
  imageUrl: string | null;
  advanced: boolean;
  analyzing: boolean;
  pipeline: PipelineStepState[];
  analysisLog: string[];
  onImageFile: (file: File | undefined) => void;
  onLogoFile: (file: File | undefined) => void;
  onTypeChange: (type: ProductType) => void;
  onAnalyze: () => void;
  onSelectZone: (id: string) => void;
  onColorChange: (id: string, value: HexColor) => void;
  onMaterialChange: (id: string, material: (typeof MATERIALS)[number]) => void;
  onSliderChange: (id: string, value: number) => void;
  onGarmentChange: (update: (current: GarmentOptions) => GarmentOptions) => void;
  onAssetRemove: (id: string) => void;
  onAssetKindChange: (id: string, kind: StudioAsset['kind']) => void;
  onAssetPlacementChange: (id: string, key: 'x' | 'y' | 'size', value: number) => void;
}

interface AssistantPanelProps {
  type: ProductType;
  messages: ChatMessage[];
  onSubmit: (text: string) => void;
}

const PIPELINE_LABELS = [
  'Détourer le produit',
  'Repérer zones et couleurs',
  'Assembler le modèle',
];

function isHexColor(value: string): value is HexColor {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function ZoneEditor({
  zone,
  selected,
  advanced,
  onSelect,
  onColorChange,
  onMaterialChange,
}: {
  zone: StudioSpec['zones'][number];
  selected: boolean;
  advanced: boolean;
  onSelect: () => void;
  onColorChange: (value: HexColor) => void;
  onMaterialChange: (material: (typeof MATERIALS)[number]) => void;
}) {
  const [hexText, setHexText] = useState<string>(zone.hex);

  useEffect(() => setHexText(zone.hex), [zone.hex]);

  return (
    <div className={`zone${selected ? ' sel' : ''}`}>
      <button className="zone-head" type="button" onClick={onSelect}>
        <span className="swatch" style={{ background: zone.hex }} />
        <strong>{zone.label}</strong>
        <span className="muted">{zone.material}</span>
      </button>
      <div className="zone-row">
        <input
          type="color"
          value={zone.hex}
          aria-label={`Couleur ${zone.label}`}
          onChange={(event) => {
            if (isHexColor(event.currentTarget.value)) onColorChange(event.currentTarget.value);
          }}
        />
        {advanced && (
          <input
            type="text"
            value={hexText}
            maxLength={7}
            aria-label={`Code HEX ${zone.label}`}
            onChange={(event) => setHexText(event.currentTarget.value)}
            onBlur={() => {
              if (isHexColor(hexText)) onColorChange(hexText);
              else setHexText(zone.hex);
            }}
          />
        )}
        <select
          value={zone.material}
          aria-label={`Matière ${zone.label}`}
          onChange={(event) => {
            const material = MATERIALS.find((preset) => preset === event.currentTarget.value);
            if (material) onMaterialChange(material);
          }}
        >
          {MATERIALS.map((material) => (
            <option key={material} value={material}>{material}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function GarmentPicker({ type, onTypeChange }: { type: ProductType; onTypeChange: (type: ProductType) => void }) {
  const [garmentId, setGarmentId] = useState(() => GARMENTS.find((item) => item.base === type)?.id ?? GARMENTS[0].id);
  const garment = GARMENTS.find((item) => item.id === garmentId) ?? GARMENTS[0];

  useEffect(() => {
    if (garment.base !== type) {
      const match = GARMENTS.find((item) => item.base === type);
      if (match) setGarmentId(match.id);
    }
  }, [type, garment.base]);

  return (
    <div className="garment-picker">
      <p className="eyebrow">Vêtement</p>
      <select
        id="garmentSelect"
        value={garment.id}
        onChange={(event) => {
          const next = GARMENTS.find((item) => item.id === event.currentTarget.value);
          if (!next) return;
          setGarmentId(next.id);
          if (next.base) onTypeChange(next.base);
        }}
      >
        {GARMENT_CATEGORIES.map((category) => (
          <optgroup key={category.id} label={category.label}>
            {GARMENTS.filter((item) => item.category === category.id).map((item) => (
              <option key={item.id} value={item.id}>
                {item.base ? item.label : `${item.label} (à créer)`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="muted small">
        {garment.base ? 'Modèle disponible dans le studio.' : 'Modèle à créer. Pièces prévues :'}
      </p>
      <ul className="piece-list">
        {garment.pieces.map((piece) => (
          <li key={piece}>{piece}</li>
        ))}
      </ul>
    </div>
  );
}

export function LeftPanel({
  type,
  spec,
  selected,
  assets,
  imageUrl,
  advanced,
  analyzing,
  pipeline,
  analysisLog,
  onImageFile,
  onLogoFile,
  onTypeChange,
  onAnalyze,
  onSelectZone,
  onColorChange,
  onMaterialChange,
  onSliderChange,
  onGarmentChange,
  onAssetRemove,
  onAssetKindChange,
  onAssetPlacementChange,
}: LeftPanelProps) {
  return (
    <aside className="panel left">
      <section className="block">
        <p className="eyebrow">Étape 1</p>
        <h2>Importer un produit</h2>
        <label
          className="dropzone"
          onDragOver={(event: DragEvent<HTMLLabelElement>) => event.preventDefault()}
          onDrop={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            onImageFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => onImageFile(event.currentTarget.files?.[0])}
          />
          {imageUrl ? (
            <img src={imageUrl} alt="Produit importé" />
          ) : (
            <span>Glissez une photo ici, ou cliquez pour choisir</span>
          )}
        </label>
        <p className="hint">Photo de face sur fond clair. Un croquis ou une photo de téléphone suffit.</p>
        <GarmentPicker type={type} onTypeChange={onTypeChange} />
        <div className="seg" id="baseSeg">
          <button
            type="button"
            className={type === 'apparel' ? 'active' : ''}
            aria-pressed={type === 'apparel'}
            onClick={() => onTypeChange('apparel')}
          >
            Vêtement
          </button>
          <button
            type="button"
            className={type === 'gear' ? 'active' : ''}
            aria-pressed={type === 'gear'}
            onClick={() => onTypeChange('gear')}
          >
            Équipement
          </button>
        </div>
        <p className="muted small">
          {type === 'apparel' ? 'Gilet zippé' : 'Gant de boxe'} : {spec.zones.map((zone) => zone.label).join(', ')}.
        </p>
      </section>

      <section className="block">
        <p className="eyebrow">Étape 2</p>
        <h2>Analyser</h2>
        <button className="btn full" type="button" disabled={analyzing} onClick={onAnalyze}>
          {analyzing ? 'Analyse en cours…' : 'Analyser le produit'}
        </button>
        <ol className="steps">
          {PIPELINE_LABELS.map((label, index) => {
            const state = pipeline[index];
            const className = state === 'done' ? 'done' : state === 'running' ? 'run' : '';
            const stateLabel = state === 'done' ? 'Terminé' : state === 'running' ? 'En cours' : 'En attente';
            return (
              <li key={label} className={className}>
                <span className="step-name">{label}</span>
                <span className="step-state">{stateLabel}</span>
                <div className="bar"><i /></div>
              </li>
            );
          })}
        </ol>
        <div className="log">
          {analysisLog.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
        </div>
      </section>

      <section className="block">
        <p className="eyebrow">Étape 3</p>
        <h2>Ajuster</h2>
        <p className="hint">Cliquez une partie du produit dans la vue, ou choisissez-la ci-dessous.</p>
        <div id="zones">
          {spec.zones.map((zone) => (
            <ZoneEditor
              key={zone.id}
              zone={zone}
              selected={selected === zone.id}
              advanced={advanced}
              onSelect={() => onSelectZone(zone.id)}
              onColorChange={(color) => onColorChange(zone.id, color)}
              onMaterialChange={(material) => onMaterialChange(zone.id, material)}
            />
          ))}
        </div>
      </section>

      <ComponentEditors
        spec={spec}
        selected={selected}
        onSelectZone={onSelectZone}
        onGarmentChange={onGarmentChange}
        onColorChange={onColorChange}
        onMaterialChange={onMaterialChange}
        onSliderChange={onSliderChange}
      />

      <section className="block">
        <h2>Proportions</h2>
        <div id="sliders">
          {/* La hauteur du col se règle dans le bloc « Col et poches ». */}
          {spec.sliders.filter((slider) => !(spec.garment && slider.id === 'col_hauteur')).map((slider) => (
            <div className="slider" key={slider.id}>
              <label htmlFor={`slider-${slider.id}`}>
                <span>{slider.label}</span>
                <span>{slider.value}</span>
              </label>
              <input
                id={`slider-${slider.id}`}
                type="range"
                min={slider.min}
                max={slider.max}
                value={slider.value}
                onChange={(event) => onSliderChange(slider.id, Number(event.currentTarget.value))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>Logos et patchs</h2>
        <label className="btn ghost full">
          Ajouter un logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => onLogoFile(event.currentTarget.files?.[0])}
          />
        </label>
        <div id="assets">
          {assets.length === 0 ? (
            <p className="muted small">Aucun logo ni patch. Importez un fichier ou demandez-le au copilote.</p>
          ) : assets.map((asset) => (
            <div className="asset" data-asset={asset.id} key={asset.id}>
              <div className="asset-head">
                <span>{asset.name}</span>
                <button className="linkbtn" type="button" onClick={() => onAssetRemove(asset.id)}>Retirer</button>
              </div>
              <select
                value={asset.kind}
                aria-label={`Type de ${asset.name}`}
                onChange={(event) => {
                  const kind = event.currentTarget.value;
                  if (kind === 'logo' || kind === 'patch' || kind === 'label') {
                    onAssetKindChange(asset.id, kind);
                  }
                }}
              >
                {(['logo', 'patch', 'label'] as const).map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
              {([
                ['x', 'Position X', -0.4, 0.4],
                ['y', 'Position Y', -0.5, 0.5],
                ['size', 'Taille', 0.05, 0.4],
              ] as const).map(([key, label, min, max]) => (
                <div className="slider" key={key}>
                  <label htmlFor={`asset-${asset.id}-${key}`}><span>{label}</span></label>
                  <input
                    id={`asset-${asset.id}-${key}`}
                    type="range"
                    min={min}
                    max={max}
                    step={0.01}
                    value={asset[key]}
                    onChange={(event) => onAssetPlacementChange(asset.id, key, Number(event.currentTarget.value))}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function AssistantPanel({ type, messages, onSubmit }: AssistantPanelProps) {
  const [input, setInput] = useState('');
  const chips = CHIPS[type];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    onSubmit(text);
  };

  return (
    <aside className="panel right copilot">
      <div className="copilot-head">
        <p className="eyebrow">Assistant</p>
        <h2>Décrire une modification</h2>
        <div className="chips">
          {chips.map((prompt) => (
            <button className="chip" type="button" key={prompt} onClick={() => onSubmit(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <div className="messages" aria-live="polite">
        {messages.map((message, index) => (
          <div className={`msg ${message.role}`} key={`${index}-${message.text}`}>
            {message.text}
            {message.pre && <pre>{message.pre}</pre>}
          </div>
        ))}
      </div>
      <form className="chatform" onSubmit={submit}>
        <input
          type="text"
          autoComplete="off"
          placeholder="Par exemple : passez le corps en noir mat"
          value={input}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setInput(event.currentTarget.value)}
        />
        <button className="btn primary" type="submit">Appliquer</button>
      </form>
    </aside>
  );
}
