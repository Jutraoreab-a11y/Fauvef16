'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { WebGLRenderer } from 'three';
import type { HexColor, ProductType } from '@/types/famal-spec';
import { AssistantPanel, LeftPanel } from './StudioPanels';
import PatternView from './PatternView';
import { ASSET_SLOTS, BASES, MATERIALS } from './data';
import { clamp, createInitialSpec, dominantColors, parseCommand, specsTableRows } from './utils';
import type {
  ChatMessage,
  PipelineStepState,
  StudioAsset,
  StudioAssetKind,
  StudioSpec,
} from './types';

const StudioCanvas = dynamic(() => import('./StudioCanvas'), {
  ssr: false,
  loading: () => <div className="canvas-loading" aria-label="Chargement du rendu 3D" />,
});

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function createId(): string {
  return crypto.randomUUID();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function Studio() {
  const [type, setType] = useState<ProductType>('apparel');
  const [spec, setSpec] = useState<StudioSpec>(() => createInitialSpec('apparel'));
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'face' | 'dos' | 'g34' | 'd34' | 'detail'>('face');
  const [context, setContext] = useState<'isolated' | 'mannequin'>('isolated');
  const [lightTheme, setLightTheme] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [compare, setCompare] = useState(false);
  const [realistic, setRealistic] = useState(false);
  const [showPattern, setShowPattern] = useState(true);
  const [project, setProject] = useState('Collection Hiver');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pipeline, setPipeline] = useState({
    first: 'waiting' as PipelineStepState,
    second: 'waiting' as PipelineStepState,
    third: 'waiting' as PipelineStepState,
  });
  const [analysisLog, setAnalysisLog] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      text: 'Copilote prêt. Décrivez un ajustement en français : le patch est appliqué à la scène.',
    },
  ]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const renderer = useRef<WebGLRenderer | null>(null);
  const objectUrls = useRef(new Set<string>());
  const currentImageUrl = useRef<string | null>(null);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (message: string) => setToastMessage(message);

  const revokeObjectUrl = (url: string) => {
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  };

  const makeImage = (file: File, onLoaded: (loaded: HTMLImageElement, url: string) => void) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      showToast('Format non accepté. Choisissez une image PNG, JPEG ou WebP.');
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    const loadedImage = new Image();
    loadedImage.onload = () => onLoaded(loadedImage, url);
    loadedImage.onerror = () => {
      revokeObjectUrl(url);
      showToast(`Impossible de charger l’image « ${file.name} ».`);
    };
    loadedImage.src = url;
  };

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    makeImage(file, (loadedImage, url) => {
      if (currentImageUrl.current) revokeObjectUrl(currentImageUrl.current);
      currentImageUrl.current = url;
      setImageUrl(url);
      setImage(loadedImage);
      showToast('Image importée');
    });
  };

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    makeImage(file, (loadedImage, url) => {
      setAssets((current) => [
        ...current,
        {
          id: createId(),
          name: file.name,
          kind: 'logo',
          image: loadedImage,
          x: 0,
          y: -0.1,
          size: 0.22,
        },
      ]);
      showToast('Logo ajouté à la scène');
    });
  };

  const handleTypeChange = (nextType: ProductType) => {
    if (type === nextType) return;
    setType(nextType);
    setSpec(createInitialSpec(nextType));
    setSelected(null);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const nextSpec = createInitialSpec(type);
    setSpec(nextSpec);
    setSelected(null);
    setPipeline({ first: 'waiting', second: 'waiting', third: 'waiting' });
    setAnalysisLog([]);
    const log: string[] = [];

    try {
      setPipeline((current) => ({ ...current, first: 'running' }));
      await pause(700);
      setPipeline((current) => ({ ...current, first: 'done', second: 'running' }));
      await pause(900);

      if (image) {
        const [mainColor, secondaryColor] = dominantColors(image);
        const mainZone = type === 'apparel' ? 'corps' : 'coque';
        const secondaryZone = type === 'apparel' ? 'bords' : 'manchette';
        const main = nextSpec.zones.find((zone) => zone.id === mainZone);
        const secondary = nextSpec.zones.find((zone) => zone.id === secondaryZone);

        if (mainColor && main) {
          main.hex = mainColor;
          log.push(`Couleur principale ${mainColor} appliquée à ${main.label}.`);
        }
        if (secondaryColor && secondary) {
          secondary.hex = secondaryColor;
          log.push(`Couleur secondaire ${secondaryColor} appliquée à ${secondary.label}.`);
        }
      } else {
        log.push('Aucune image importée : base 3D par défaut utilisée.');
      }

      log.push('Éclatement simulé localement : Claude Vision le remplacera en Phase 2.');
      setPipeline((current) => ({ ...current, second: 'done', third: 'running' }));
      await pause(500);
      setSpec(nextSpec);
      setPipeline((current) => ({ ...current, third: 'done' }));
      setAnalysisLog(log);
      showToast('Pipeline terminé');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'L’analyse du produit a échoué.');
      throw error;
    } finally {
      setAnalyzing(false);
    }
  };

  const handleColorChange = (id: string, value: HexColor) => {
    setSpec((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === id ? { ...zone, hex: value } : zone),
    }));
  };

  const handleMaterialChange = (id: string, material: (typeof MATERIALS)[number]) => {
    setSpec((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === id ? { ...zone, material } : zone),
    }));
  };

  const handleSliderChange = (id: string, value: number) => {
    setSpec((current) => ({
      ...current,
      sliders: current.sliders.map((slider) => slider.id === id ? { ...slider, value } : slider),
    }));
  };

  const handleAssetRemove = (id: string) => {
    const removed = assets.find((asset) => asset.id === id);
    if (removed?.image?.src.startsWith('blob:')) revokeObjectUrl(removed.image.src);
    setAssets((current) => current.filter((asset) => asset.id !== id));
  };

  const handleAssetKindChange = (id: string, kind: StudioAssetKind) => {
    setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, kind } : asset));
  };

  const handleAssetPlacementChange = (
    id: string,
    key: 'x' | 'y' | 'size',
    value: number,
  ) => {
    setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, [key]: value } : asset));
  };

  const handleAssistantSubmit = (text: string) => {
    setMessages((current) => [...current, { role: 'user', text }]);
    const patches = parseCommand(text, type, spec.zones);
    if (patches.length === 0) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: 'Je n’ai pas reconnu de modification. Essayez par exemple : « passe la coque en noir mat » ou « rends la coupe plus boxy ».',
        },
      ]);
      return;
    }

    const nextSpec: StudioSpec = {
      zones: spec.zones.map((zone) => ({ ...zone })),
      sliders: spec.sliders.map((slider) => ({ ...slider })),
    };
    const nextAssets = [...assets];
    const lines: string[] = [];

    patches.forEach((patch) => {
      if (patch.op === 'set_color') {
        const zone = nextSpec.zones.find((item) => item.id === patch.zone);
        if (zone) zone.hex = patch.hex;
        lines.push(`${zone?.label ?? patch.zone} : ${patch.label} (${patch.hex})`);
      } else if (patch.op === 'set_material') {
        const zone = nextSpec.zones.find((item) => item.id === patch.zone);
        if (zone) zone.material = patch.material;
        lines.push(`${zone?.label ?? patch.zone} : matière ${patch.material}`);
      } else if (patch.op === 'slider') {
        const slider = nextSpec.sliders.find((item) => item.id === patch.id);
        if (slider) {
          slider.value = clamp(slider.value + patch.delta, slider.min, slider.max);
          lines.push(`${slider.label} : ${slider.value}`);
        }
      } else {
        const zone = nextSpec.zones.find((item) => item.id === patch.zone);
        const [x, y] = ASSET_SLOTS[patch.zone] ?? [0, 0];
        nextAssets.push({
          id: createId(),
          name: `Patch ${zone?.label ?? patch.zone}`,
          kind: 'patch',
          image: null,
          x,
          y,
          size: 0.14,
        });
        lines.push(`Patch ajouté sur ${zone?.label ?? patch.zone}`);
      }
    });

    setSpec(nextSpec);
    setAssets(nextAssets);
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        text: `Patch appliqué à la scène :\n${lines.map((line) => `- ${line}`).join('\n')}`,
        pre: JSON.stringify({ patches }, null, 2),
      },
    ]);
  };

  const handleExport = () => {
    const base = BASES[type];
    const pack = {
      project,
      product_type: type,
      category: base.name,
      generated_at: new Date().toISOString(),
      zones: spec.zones.map(({ id, label, hex, material }) => ({ id, label, hex, material })),
      sliders: spec.sliders.map(({ id, label, value }) => ({ id, label, value })),
      assets: assets.map((asset) => ({
        asset_type: asset.kind,
        name: asset.name,
        placement: { x: asset.x, y: asset.y, size: asset.size },
      })),
      specs_table: specsTableRows(base.specsTable),
    };
    download(
      new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }),
      `techpack-${type}.json`,
    );

    const activeRenderer = renderer.current;
    if (!activeRenderer) {
      showToast('Fiche JSON exportée, mais le rendu 3D n’est pas encore prêt pour l’image PNG.');
      return;
    }

    activeRenderer.domElement.toBlob((blob) => {
      if (!blob) {
        showToast('La fiche JSON a été exportée, mais la capture PNG a échoué.');
        return;
      }
      download(blob, `techpack-${type}-vue.png`);
      showToast('Dossier exporté (JSON et PNG). Le PDF multi-pages et le ZIP sont prévus en Phase 4.');
    }, 'image/png');
  };

  const status = `${BASES[type].name} · Vue ${
    view === 'g34' ? '3/4 Gauche' : view === 'd34' ? '3/4 Droit' : view === 'dos' ? 'Dos' : view === 'detail' ? 'Détail' : 'Face'
  } · ${context === 'isolated' ? 'Isolé' : 'Avec mannequin'} · ${spec.zones.length} zones`;

  return (
    <div className={`app${lightTheme ? ' light' : ''}${advanced ? ' adv' : ''}${compare ? ' compare' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="wordmark">FauveF16</span>
          <span className="sep" />
          <select
            className="select-quiet"
            aria-label="Collection"
            value={project}
            onChange={(event) => setProject(event.currentTarget.value)}
          >
            <option>Collection Hiver</option>
            <option>Collection Été</option>
          </select>
        </div>
        <div className="top-actions">
          <button
            className="btn-text"
            type="button"
            aria-pressed={lightTheme}
            onClick={() => setLightTheme((current) => !current)}
          >
            {lightTheme ? 'Thème sombre' : 'Thème clair'}
          </button>
          <button
            className="btn-text"
            type="button"
            aria-pressed={advanced}
            onClick={() => setAdvanced((current) => !current)}
          >
            Réglages avancés
          </button>
          <button className="btn primary" type="button" onClick={handleExport}>
            Exporter le dossier fournisseur
          </button>
        </div>
      </header>

      <main className="layout">
        <LeftPanel
          type={type}
          spec={spec}
          selected={selected}
          assets={assets}
          imageUrl={imageUrl}
          advanced={advanced}
          analyzing={analyzing}
          pipeline={[pipeline.first, pipeline.second, pipeline.third]}
          analysisLog={analysisLog}
          onImageFile={handleImageFile}
          onLogoFile={handleLogoFile}
          onTypeChange={handleTypeChange}
          onAnalyze={() => { void handleAnalyze(); }}
          onSelectZone={setSelected}
          onColorChange={handleColorChange}
          onMaterialChange={handleMaterialChange}
          onSliderChange={handleSliderChange}
          onAssetRemove={handleAssetRemove}
          onAssetKindChange={handleAssetKindChange}
          onAssetPlacementChange={handleAssetPlacementChange}
        />

        <section className="stage">
          <div className="toolbar">
            <div className="seg" id="viewSeg">
              {([
                ['face', 'Face'],
                ['dos', 'Dos'],
                ['g34', 'Côté gauche'],
                ['d34', 'Côté droit'],
                ['detail', 'Détail'],
              ] as const).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={view === id ? 'active' : ''}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="seg" id="ctxSeg">
              {([
                ['isolated', 'Produit seul'],
                ['mannequin', 'Sur mannequin'],
              ] as const).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={context === id ? 'active' : ''}
                  aria-pressed={context === id}
                  onClick={() => setContext(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn ghost"
              type="button"
              aria-pressed={compare}
              onClick={() => setCompare((current) => !current)}
            >
              Comparer avec la photo
            </button>
            <button
              className={realistic ? 'btn primary' : 'btn ghost'}
              type="button"
              aria-pressed={realistic}
              onClick={() => setRealistic((current) => !current)}
            >
              {realistic ? 'Quitter la vue réelle' : 'Vue réelle'}
            </button>
            <button
              className={showPattern ? 'btn primary' : 'btn ghost'}
              type="button"
              aria-pressed={showPattern}
              onClick={() => setShowPattern((current) => !current)}
            >
              {showPattern ? 'Masquer le patron' : 'Vue patron'}
            </button>
          </div>
          <div className="canvas-wrap">
            <div className="viewer-box">
              <StudioCanvas
                type={type}
                spec={spec}
                assets={assets}
                selected={selected}
                view={view}
                context={context}
                lightTheme={lightTheme}
                realistic={realistic}
                onSelect={setSelected}
                onRendererReady={(value) => { renderer.current = value; }}
              />
            </div>
            {showPattern && (
              <PatternView
                type={type}
                spec={spec}
                selected={selected}
                onSelect={(id) => setSelected(id)}
              />
            )}
            <div className="ref-box">
              <p className="eyebrow">Photo de référence</p>
              <div className="ref-img">
                {imageUrl
                  ? <img src={imageUrl} alt="Photo de référence du produit" />
                  : <span className="muted small">Importez une photo à l’étape 1 pour la voir ici.</span>}
              </div>
            </div>
          </div>
          <div className="statusbar">
            <span>{status}</span>
            <span className="muted">Glisser pour tourner · molette pour zoomer · cliquer une zone pour la sélectionner</span>
          </div>
        </section>

        <AssistantPanel type={type} messages={messages} onSubmit={handleAssistantSubmit} />
      </main>
      {toastMessage && <div className="toast" role="status">{toastMessage}</div>}
    </div>
  );
}
