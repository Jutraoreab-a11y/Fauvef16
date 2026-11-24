'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useEffect, useMemo } from 'react';
import type { WebGLRenderer } from 'three';
import { MATERIALS } from './data';
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

interface ProductPart {
  id: string;
  zone: string;
  geometry: THREE.BufferGeometry;
}

interface TextureMaps {
  knit: THREE.CanvasTexture;
  rib: THREE.CanvasTexture;
  leather: THREE.CanvasTexture;
}

const VIEW_ROTATION: Record<StudioView, number> = {
  face: 0,
  dos: Math.PI,
  g34: -0.75,
  d34: 0.75,
  detail: 0,
};

const VIEW_CAMERA: Record<StudioView, [number, number]> = {
  face: [5.4, 0],
  dos: [5.4, 0],
  g34: [5.4, 0],
  d34: [5.4, 0],
  detail: [2.6, 0.35],
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

function createTextureMaps(): TextureMaps {
  const knit = createTexture((context, size) => {
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

  const rib = createTexture((context, size) => {
    for (let x = 0; x < size; x += 16) {
      const gradient = context.createLinearGradient(x, 0, x + 16, 0);
      gradient.addColorStop(0, '#3a3a3a');
      gradient.addColorStop(0.5, '#e0e0e0');
      gradient.addColorStop(1, '#3a3a3a');
      context.fillStyle = gradient;
      context.fillRect(x, 0, 16, size);
    }
  }, 256, 4);

  const leather = createTexture((context, size) => {
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

function polygon(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function roundedRectangle(x0: number, y0: number, x1: number, y1: number, radius: number) {
  const shape = new THREE.Shape();
  shape.moveTo(x0 + radius, y0);
  shape.lineTo(x1 - radius, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + radius);
  shape.lineTo(x1, y1 - radius);
  shape.quadraticCurveTo(x1, y1, x1 - radius, y1);
  shape.lineTo(x0 + radius, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - radius);
  shape.lineTo(x0, y0 + radius);
  shape.quadraticCurveTo(x0, y0, x0 + radius, y0);
  return shape;
}

function extrude(shape: THREE.Shape, depth: number, zOffset = 0): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2 + zOffset);
  return geometry;
}

function vestParts(values: Record<string, number>): ProductPart[] {
  const boxiness = 0.82 + (values.boxy ?? 40) * 0.005;
  const bottom = -1.05 - ((values.longueur ?? 55) - 55) * 0.006;
  const collarHeight = 0.12 + (values.col_hauteur ?? 30) * 0.0035;
  const parts: ProductPart[] = [];
  const add = (zone: string, id: string, geometry: THREE.BufferGeometry) => {
    parts.push({ id, zone, geometry });
  };

  add('corps', 'body', extrude(polygon([
    [-0.2, 0.98], [-0.6, 0.9], [-0.78, 0.5], [-boxiness, 0.2], [-boxiness, bottom],
    [boxiness, bottom], [boxiness, 0.2], [0.78, 0.5], [0.6, 0.9], [0.2, 0.98],
  ]), 0.14));
  add('manches', 'left-sleeve', extrude(polygon([
    [-0.6, 0.9], [-0.2, 0.98], [-0.2, 0.72], [-0.66, 0.66],
  ]), 0.1, 0.08));
  add('manches', 'right-sleeve', extrude(polygon([
    [0.6, 0.9], [0.2, 0.98], [0.2, 0.72], [0.66, 0.66],
  ]), 0.1, 0.08));
  add('col', 'collar', extrude(polygon([
    [-0.24, 0.98], [-0.22, 0.98 + collarHeight], [0.22, 0.98 + collarHeight], [0.24, 0.98],
  ]), 0.12, 0.02));
  add('bords', 'ribbing', extrude(polygon([
    [-boxiness - 0.01, bottom], [boxiness + 0.01, bottom],
    [boxiness + 0.01, bottom + 0.1], [-boxiness - 0.01, bottom + 0.1],
  ]), 0.16));
  add('zip', 'zip', new THREE.BoxGeometry(0.03, 0.98 - bottom, 0.03)
    .translate(0, (0.98 + bottom) / 2, 0.13));
  add('poches', 'left-pocket', extrude(roundedRectangle(-0.6, -0.45, -0.2, -0.12, 0.03), 0.04, 0.12));
  add('poches', 'right-pocket', extrude(roundedRectangle(0.2, -0.45, 0.6, -0.12, 0.03), 0.04, 0.12));
  add('boutons', 'left-button', new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1, 0.5).translate(-0.4, -0.16, 0.2));
  add('boutons', 'right-button', new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1, 0.5).translate(0.4, -0.16, 0.2));
  add('boutons', 'left-collar-button', new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1, 0.5).translate(-0.1, 1.02 + collarHeight * 0.5, 0.11));
  add('boutons', 'right-collar-button', new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1, 0.5).translate(0.1, 1.02 + collarHeight * 0.5, 0.11));
  add('couture', 'left-pocket-stitch', new THREE.BoxGeometry(0.4, 0.01, 0.01).translate(-0.4, -0.12, 0.17));
  add('couture', 'right-pocket-stitch', new THREE.BoxGeometry(0.4, 0.01, 0.01).translate(0.4, -0.12, 0.17));
  add('couture', 'bottom-stitch', new THREE.BoxGeometry(2 * boxiness - 0.1, 0.01, 0.01).translate(0, bottom + 0.1, 0.12));
  return parts;
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
  const parts = useMemo(
    () => (type === 'apparel' ? vestParts(values) : gloveParts(values)),
    [type, values],
  );
  const textures = useMemo(createTextureMaps, []);
  const zones = useMemo(() => new Map(spec.zones.map((zone) => [zone.id, zone])), [spec.zones]);

  useEffect(() => () => {
    textures.knit.dispose();
    textures.rib.dispose();
    textures.leather.dispose();
  }, [textures]);

  return (
    <group rotation-y={VIEW_ROTATION[view]}>
      {parts.map((part) => {
        const zone = zones.get(part.zone);
        if (!zone) return null;
        const isHiddenFromBack = type === 'apparel' && view === 'dos' && BACK_HIDE.has(part.zone);
        const materialMap = zone.material === 'maille épaisse'
          ? textures.rib
          : zone.material === 'cuir mat' || zone.material === 'cuir brillant'
            ? textures.leather
            : zone.material === 'métal'
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
              map={materialMap}
              bumpMap={materialMap}
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
  const color = lightTheme ? '#cfcac2' : '#2a2c31';
  return (
    <group visible={context === 'mannequin'}>
      {type === 'apparel' ? (
        <>
          <mesh position={[0, -0.15, 0]} castShadow>
            <capsuleGeometry args={[0.55, 1.2, 12, 24]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.18, 0.3, 24]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.42, 0]} scale={[0.9, 1.1, 0.95]} castShadow>
            <sphereGeometry args={[0.26, 32, 24]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[-0.85, 0.05, 0]} rotation-z={0.18} castShadow>
            <capsuleGeometry args={[0.14, 0.9, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0.85, 0.05, 0]} rotation-z={-0.18} castShadow>
            <capsuleGeometry args={[0.14, 0.9, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, -1, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.42, 1.6, 32]} />
          <meshStandardMaterial color={color} roughness={0.9} />
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
}: {
  asset: StudioAsset;
  type: StudioCanvasProps['type'];
  view: StudioView;
}) {
  const texture = useMemo(
    () => asset.image ? new THREE.CanvasTexture(asset.image) : patchTexture('PATCH'),
    [asset.image],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ratio = asset.image ? asset.image.naturalHeight / asset.image.naturalWidth : 1;
  const width = asset.size * 2.2;

  return (
    <mesh
      position={[
        asset.x * 1.4,
        asset.y * 1.6 + (type === 'apparel' ? 0.3 : -0.1),
        type === 'apparel' ? 0.2 : 0.66,
      ]}
      visible={view !== 'dos'}
    >
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

function CameraRig({ view }: { view: StudioView }) {
  const { camera } = useThree();
  const [distance, height] = VIEW_CAMERA[view];

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
      maxDistance={7}
      enableDamping
    />
  );
}

/** Éclairage « studio photo » : environnement HDR procédural, sans téléchargement réseau. */
function RealisticLighting({ enabled }: { enabled: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    if (!enabled) return undefined;

    const pmrem = new THREE.PMREMGenerator(gl);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnvironment = scene.environment;
    const previousExposure = gl.toneMappingExposure;

    scene.environment = envTexture;
    scene.environmentIntensity = 0.6;
    gl.toneMappingExposure = 1.1;

    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = 1;
      gl.toneMappingExposure = previousExposure;
      envTexture.dispose();
      pmrem.dispose();
    };
  }, [enabled, gl, scene]);

  return null;
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
  return (
    <Canvas
      camera={{ position: [0, 0, 5.4], fov: 30 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      fallback={<p className="fallback">Le rendu 3D n’est pas disponible dans ce navigateur.</p>}
      onPointerMissed={() => onSelect(null)}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        onRendererReady(gl);
      }}
    >
      <color attach="background" args={[lightTheme ? '#F4F1EC' : '#0C0C0D']} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={[0xffffff, 0x222222, 0.55]} />
      <directionalLight
        position={[2.5, 3, 3]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-3, 1, 2]} intensity={0.65} />
      <mesh rotation-x={-Math.PI / 2} position-y={-1.45} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={lightTheme ? 0.12 : 0.35} />
      </mesh>
      <RealisticLighting enabled={realistic} />
      {realistic && (
        <ContactShadows position={[0, -1.44, 0]} opacity={0.6} scale={8} blur={2.4} far={3} />
      )}
      <group>
        <Mannequin type={type} lightTheme={lightTheme} context={context} />
        <ProductMeshes
          type={type}
          spec={spec}
          selected={selected}
          view={view}
          onSelect={onSelect}
        />
        <group rotation-y={VIEW_ROTATION[view]}>
          {assets.map((asset) => (
            <AssetDecal key={asset.id} asset={asset} type={type} view={view} />
          ))}
        </group>
      </group>
      <CameraRig view={view} />
    </Canvas>
  );
}
