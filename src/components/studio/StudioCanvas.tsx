'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useEffect, useMemo } from 'react';
import type { WebGLRenderer } from 'three';
import { MATERIALS } from './data';
import { garmentFrontZ, mannequinGeometries, vestParts, type ProductPart } from './garment';
import type {
  StudioAsset,
  StudioContext,
  StudioSpec,
  StudioView,
  StudioZone,
} from './types';

interface StudioCanvasProps {
  type: 'apparel' | 'gear';
  spec: StudioSpec;
  assets: StudioAsset[];
  selected: string | null;
  view: StudioView;
  context: StudioContext;
  lightTheme: boolean;
  realistic: boolean;
  onSelect: (id: string | null) => void;
  onRendererReady: (renderer: WebGLRenderer) => void;
}

interface TexturePair {
  /** Texture de couleur claire : elle module la teinte sans l'assombrir. */
  map: THREE.CanvasTexture;
  /** Texture contrastée, utilisée seulement pour le relief. */
  bump: THREE.CanvasTexture;
}

interface TextureMaps {
  knit: TexturePair;
  rib: TexturePair;
  leather: TexturePair;
}

const VIEW_ROTATION: Record<StudioView, number> = {
  face: 0,
  dos: Math.PI,
  g34: -0.75,
  d34: 0.75,
  detail: 0,
};

// [distance, hauteur visée] : cadre tout le mannequin, tête comprise.
const VIEW_CAMERA: Record<StudioView, [number, number]> = {
  face: [6.2, 0.15],
  dos: [6.2, 0.15],
  g34: [6.2, 0.15],
  d34: [6.2, 0.15],
  detail: [2.6, 0.45],
};

const BACK_HIDE = new Set(['zip', 'poches', 'boutons']);

function createTexture(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size: number,
  repeat: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossible de créer une texture pour le modèle 3D.');

  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}

/**
 * Une texture grise multipliée par la couleur divisait la luminosité des tissus par 4 à 5.
 * On garde le motif contrasté pour le relief et on en tire une version presque blanche pour la couleur.
 */
function createTexturePair(
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  size: number,
  repeat: number,
): TexturePair {
  let source: HTMLCanvasElement | null = null;
  const bump = createTexture((context, canvasSize) => {
    draw(context, canvasSize);
    source = context.canvas;
  }, size, repeat);
  bump.colorSpace = THREE.NoColorSpace;
  const map = createTexture((context, canvasSize) => {
    if (source) context.drawImage(source, 0, 0);
    context.fillStyle = 'rgba(255,255,255,0.78)';
    context.fillRect(0, 0, canvasSize, canvasSize);
  }, size, repeat);
  return { map, bump };
}

function createTextureMaps(): TextureMaps {
  const knit = createTexturePair((context, size) => {
    context.fillStyle = '#808080';
    context.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        const shade = 100 + Math.random() * 60;
        context.strokeStyle = `rgb(${shade},${shade},${shade})`;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(x, y + 7);
        context.lineTo(x + 4, y + 1);
        context.lineTo(x + 8, y + 7);
        context.stroke();
      }
    }
  }, 256, 3);

  const rib = createTexturePair((context, size) => {
    for (let x = 0; x < size; x += 16) {
      const gradient = context.createLinearGradient(x, 0, x + 16, 0);
      gradient.addColorStop(0, '#3a3a3a');
      gradient.addColorStop(0.5, '#e0e0e0');
      gradient.addColorStop(1, '#3a3a3a');
      context.fillStyle = gradient;
      context.fillRect(x, 0, 16, size);
    }
  }, 256, 4);

  const leather = createTexturePair((context, size) => {
    context.fillStyle = '#7a7a7a';
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < 2600; index += 1) {
      const shade = 90 + Math.random() * 70;
      context.fillStyle = `rgb(${shade},${shade},${shade})`;
      context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  }, 256, 2);

  return { knit, rib, leather };
}

function gloveParts(values: Record<string, number>): ProductPart[] {
  const padding = 0.9 + (values.rembourrage ?? 50) * 0.003;
  const cuffHeight = 0.5 + (values.longueur_manchette ?? 45) * 0.008;
  return [
    {
      id: 'shell',
      zone: 'coque',
      geometry: new THREE.SphereGeometry(1, 64, 40)
        .scale(0.66 * padding, 0.72 * padding, 0.6 * padding)
        .translate(0, 0.2, 0),
    },
    {
      id: 'thumb',
      zone: 'pouce',
      geometry: new THREE.CapsuleGeometry(0.17, 0.32, 12, 24)
        .rotateZ(0.5)
        .translate(-0.52, -0.05, 0.14),
    },
    {
      id: 'palm',
      zone: 'paume',
      geometry: new THREE.SphereGeometry(1, 48, 32)
        .scale(0.5, 0.42, 0.42)
        .translate(0.08, -0.2, 0.34),
    },
    {
      id: 'cuff',
      zone: 'manchette',
      geometry: new THREE.CylinderGeometry(0.5, 0.56, cuffHeight, 48, 1, true)
        .translate(0, -0.35 - cuffHeight / 2, 0),
    },
    {
      id: 'strap',
      zone: 'scratch',
      geometry: new THREE.CylinderGeometry(0.535, 0.535, 0.16, 48, 1, true)
        .translate(0, -0.35 - cuffHeight * 0.35, 0),
    },
    {
      id: 'stitch',
      zone: 'couture',
      geometry: new THREE.TorusGeometry(0.5, 0.012, 8, 64)
        .rotateX(Math.PI / 2)
        .translate(0, -0.35, 0),
    },
  ];
}

function ProductMeshes({
  type,
  spec,
  selected,
  view,
  onSelect,
}: Pick<StudioCanvasProps, 'type' | 'spec' | 'selected' | 'view' | 'onSelect'>) {
  const sliderKey = JSON.stringify(spec.sliders.map(({ id, value }) => [id, value]));
  const values = useMemo(
    () => Object.fromEntries(spec.sliders.map(({ id, value }) => [id, value])),
    [sliderKey],
  );
  const garmentKey = JSON.stringify(spec.garment ?? null);
  const parts = useMemo(
    () => (type === 'apparel' ? vestParts(values, spec.garment) : gloveParts(values)),
    // garmentKey suit le contenu des options : on ne reconstruit pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, values, garmentKey],
  );
  const textures = useMemo(createTextureMaps, []);
  const zones = useMemo(() => new Map(spec.zones.map((zone) => [zone.id, zone])), [spec.zones]);

  useEffect(() => () => {
    Object.values(textures).forEach(({ map, bump }) => {
      map.dispose();
      bump.dispose();
    });
  }, [textures]);

  useEffect(() => () => {
    parts.forEach((part) => part.geometry.dispose());
  }, [parts]);

  return (
    <group>
      {parts.map((part) => {
        const zone = zones.get(part.zone);
        if (!zone) return null;
        const isHiddenFromBack = type === 'apparel' && view === 'dos' && BACK_HIDE.has(part.zone);
        const materialMap = zone.material === 'maille épaisse'
          ? textures.rib
          : zone.material === 'cuir mat' || zone.material === 'cuir brillant'
            ? textures.leather
            : zone.material === 'métal' || zone.material === 'résine mate'
              ? null
              : textures.knit;
        const materialSettings = materialProperties(zone);

        return (
          <mesh
            key={part.id}
            geometry={part.geometry}
            visible={!isHiddenFromBack}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onSelect(part.zone);
            }}
          >
            <meshPhysicalMaterial
              color={zone.hex}
              side={THREE.DoubleSide}
              map={materialMap?.map ?? null}
              bumpMap={materialMap?.bump ?? null}
              bumpScale={materialSettings.bumpScale}
              roughness={materialSettings.roughness}
              metalness={materialSettings.metalness}
              sheen={materialSettings.sheen}
              sheenRoughness={materialSettings.sheenRoughness}
              clearcoat={materialSettings.clearcoat}
              clearcoatRoughness={materialSettings.clearcoatRoughness}
              emissive={selected === zone.id ? '#3a3428' : '#000000'}
              emissiveIntensity={selected === zone.id ? 1 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function materialProperties(zone: StudioZone) {
  const presets = {
    molleton: { roughness: 0.92, metalness: 0, sheen: 0.6, sheenRoughness: 0.6, bumpScale: 0.6, clearcoat: 0, clearcoatRoughness: 0 },
    'maille épaisse': { roughness: 0.95, metalness: 0, sheen: 0.4, sheenRoughness: 0.7, bumpScale: 0.8, clearcoat: 0, clearcoatRoughness: 0 },
    'coton lourd': { roughness: 0.85, metalness: 0, sheen: 0.3, sheenRoughness: 0.7, bumpScale: 0.4, clearcoat: 0, clearcoatRoughness: 0 },
    'cuir mat': { roughness: 0.6, metalness: 0, sheen: 0, sheenRoughness: 0.5, bumpScale: 0.25, clearcoat: 0, clearcoatRoughness: 0 },
    'cuir brillant': { roughness: 0.22, metalness: 0, sheen: 0, sheenRoughness: 0.5, bumpScale: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.15 },
    'microfibre haute densité': { roughness: 0.5, metalness: 0, sheen: 0.5, sheenRoughness: 0.4, bumpScale: 0.15, clearcoat: 0, clearcoatRoughness: 0 },
    métal: { roughness: 0.3, metalness: 1, sheen: 0, sheenRoughness: 0.5, bumpScale: 0, clearcoat: 0, clearcoatRoughness: 0 },
    'résine mate': { roughness: 0.55, metalness: 0, sheen: 0, sheenRoughness: 0.5, bumpScale: 0, clearcoat: 0.2, clearcoatRoughness: 0.6 },
  } satisfies Record<(typeof MATERIALS)[number], {
    roughness: number;
    metalness: number;
    sheen: number;
    sheenRoughness: number;
    bumpScale: number;
    clearcoat: number;
    clearcoatRoughness: number;
  }>;
  return presets[zone.material];
}

function Mannequin({
  type,
  lightTheme,
  context,
}: Pick<StudioCanvasProps, 'type' | 'lightTheme' | 'context'>) {
  // Un peu plus clair qu'avant en thème sombre, pour que le mannequin se détache du fond.
  const color = lightTheme ? '#d6d1c9' : '#3a3d44';
  const geometries = useMemo(() => (type === 'apparel' ? mannequinGeometries() : []), [type]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  return (
    <group visible={context === 'mannequin'}>
      {type === 'apparel' ? (
        geometries.map((geometry, index) => (
          <mesh key={index} geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.75} side={THREE.DoubleSide} />
          </mesh>
        ))
      ) : (
        <mesh position={[0, -1, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.42, 1.6, 32]} />
          <meshStandardMaterial color={color} roughness={0.75} />
        </mesh>
      )}
    </group>
  );
}

function patchTexture(label: string): THREE.CanvasTexture {
  return createTexture((context, size) => {
    context.fillStyle = '#1a1a1d';
    context.fillRect(0, 0, size, size);
    context.strokeStyle = '#c8b89a';
    context.lineWidth = 6;
    context.strokeRect(14, 14, size - 28, size - 28);
    context.fillStyle = '#EDEBE7';
    context.font = '500 44px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, size / 2, size / 2);
  }, 256, 1);
}

function AssetDecal({
  asset,
  type,
  view,
  values,
}: {
  asset: StudioAsset;
  type: StudioCanvasProps['type'];
  view: StudioView;
  values: Record<string, number>;
}) {
  const texture = useMemo(
    () => asset.image ? new THREE.CanvasTexture(asset.image) : patchTexture('PATCH'),
    [asset.image],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ratio = asset.image ? asset.image.naturalHeight / asset.image.naturalWidth : 1;
  const width = asset.size * 2.2;
  const x = asset.x * 1.4;
  const y = asset.y * 1.6 + (type === 'apparel' ? 0.3 : -0.1);
  // Sur le gilet, le patch est plaqué sur la face avant au lieu de flotter à profondeur fixe.
  const z = type === 'apparel' ? garmentFrontZ(values, x, y) + 0.03 : 0.66;

  return (
    <mesh position={[x, y, z]} visible={view !== 'dos'}>
      <planeGeometry args={[width, width * ratio]} />
      <meshStandardMaterial
        map={texture}
        transparent
        roughness={0.6}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

// Largeur à garder visible (manches comprises) : sert quand la vue 3D devient étroite,
// par exemple quand le patron à plat s'ouvre à côté.
const FRAME_WIDTH = 2.5;

function CameraRig({ view }: { view: StudioView }) {
  const { camera, size } = useThree();
  const [baseDistance, height] = VIEW_CAMERA[view];
  const aspect = size.width / Math.max(size.height, 1);
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 30;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const distance = view === 'detail'
    ? baseDistance
    : Math.max(baseDistance, FRAME_WIDTH / (2 * halfTan * aspect));

  useEffect(() => {
    camera.position.set(0, height, distance);
    camera.lookAt(0, height, 0);
    camera.updateProjectionMatrix();
  }, [camera, distance, height]);

  return (
    <OrbitControls
      makeDefault
      target={[0, height, 0]}
      minDistance={2.2}
      maxDistance={14}
      enableDamping
    />
  );
}

/**
 * Éclairage studio permanent : environnement procédural (reflets du zip, des pressions,
 * du cuir) + lumière principale, contre-jours pour détacher les silhouettes sombres du fond,
 * et un fill doux. La « Vue réelle » pousse seulement l'environnement et l'exposition.
 */
function StudioLighting({ realistic }: { realistic: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnvironment = scene.environment;
    scene.environment = envTexture;
    return () => {
      scene.environment = previousEnvironment;
      envTexture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = realistic ? 0.85 : 0.5;
    gl.toneMappingExposure = realistic ? 1.15 : 1.05;
  }, [realistic, gl, scene]);

  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={[0xffffff, 0x4a4642, 0.65]} />
      <directionalLight
        position={[2.8, 4, 4]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-4, 1.5, 2.5]} intensity={0.75} />
      <directionalLight position={[-2.5, 2.8, -3.5]} intensity={1.3} />
      <directionalLight position={[2.8, 1.2, -3.5]} intensity={0.9} />
    </>
  );
}

export default function StudioCanvas({
  type,
  spec,
  assets,
  selected,
  view,
  context,
  lightTheme,
  realistic,
  onSelect,
  onRendererReady,
}: StudioCanvasProps) {
  const values = useMemo(
    () => Object.fromEntries(spec.sliders.map(({ id, value }) => [id, value])),
    [spec.sliders],
  );

  return (
    <Canvas
      camera={{ position: [0, 0.15, 6.2], fov: 30 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      fallback={<p className="fallback">Le rendu 3D n’est pas disponible dans ce navigateur.</p>}
      onPointerMissed={() => onSelect(null)}
      onCreated={({ gl }) => {
        // Neutral garde les teintes fidèles à la fiche, là où ACES les assombrit et les désature.
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        onRendererReady(gl);
      }}
    >
      <color attach="background" args={[lightTheme ? '#F4F1EC' : '#0C0C0D']} />
      <StudioLighting realistic={realistic} />
      <mesh rotation-x={-Math.PI / 2} position-y={-1.45} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={lightTheme ? 0.12 : 0.35} />
      </mesh>
      {realistic && (
        <ContactShadows position={[0, -1.44, 0]} opacity={0.6} scale={8} blur={2.4} far={3} />
      )}
      {/* Mannequin, vêtement et patchs tournent ensemble : ils ne peuvent plus se décaler. */}
      <group rotation-y={VIEW_ROTATION[view]}>
        <Mannequin type={type} lightTheme={lightTheme} context={context} />
        <ProductMeshes
          type={type}
          spec={spec}
          selected={selected}
          view={view}
          onSelect={onSelect}
        />
        {assets.map((asset) => (
          <AssetDecal key={asset.id} asset={asset} type={type} view={view} values={values} />
        ))}
      </group>
      <CameraRig view={view} />
    </Canvas>
  );
}
