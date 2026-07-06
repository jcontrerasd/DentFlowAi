'use client';

import { Suspense, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useLoader, type ThreeEvent } from '@react-three/fiber';
import { STLLoader, PLYLoader, OBJLoader } from '@/lib/three-loaders';
import {
  OrbitControls,
  Center,
  Html,
  Line,
} from '@react-three/drei';
import type { Group } from 'three';
import type { OrbitControls as ThreeOrbitControls } from 'three-stdlib';
import * as THREE from 'three';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import {
  dedupeConsecutive,
  dist3,
  distToSegment,
  capClosedPolyline,
  PERSIST_MAX_POINTS,
  PERSIST_RESAMPLE_TARGET,
} from '@/lib/viewer3d/polylineGeometry';
import {
  installBVHRaycast,
  scheduleBoundsTree,
  closestSurfacePoint,
  pickHomeMesh,
  wrapClosedPolylineToSurface,
  type SurfaceWrap,
} from '@/lib/viewer3d/surfaceProjection';
import PolylineNodeEditor from '@/components/viewer3d/PolylineNodeEditor';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Maximize2,
  MessageSquare,
  MessageSquareOff,
  MessageSquarePlus,
  Navigation,
  Pencil,
  RefreshCcw,
  Settings2,
  Spline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type ViewerBg = 'neutro' | 'brand' | 'claro';

// Umbrales del trazado freehand (px de pantalla — densidad constante independiente del zoom).
const DRAG_THRESHOLD_PX = 6;      // distinguir clic discreto de arrastre freehand
const SAMPLE_MIN_PX = 5;          // distancia mínima entre muestras durante el arrastre
const CLOSE_SNAP_PX = 12;         // radio de cierre automático sobre el punto inicial
const CLOSE_ARM_PX = 24;          // hay que alejarse esto del inicio antes de poder cerrar
const MIN_POINTS_TO_CLOSE = 3;
const DEDUPE_MIN_DIST = 0.05;     // mm — colapsa muestras casi duplicadas
const CURVE_GRAB_NODE_RADIUS = 1.2; // mm — distancia para tomar nodo existente al agarrar la curva

// Raycast acelerado por BVH para todos los meshes (sin boundsTree cae al nativo —
// STLThumbnail y demás Canvas no cambian de comportamiento).
if (typeof window !== 'undefined') installBVHRaycast();

function screenDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const VIEWER_BG_STORAGE_KEY = 'dentflow_viewer_bg';
const VIEWER_BG_COLORS: Record<ViewerBg, string> = {
  neutro: '#020617',
  brand: '#1A2347',
  claro: '#E2E8F0',
};
const VIEWER_BG_LABELS: Record<ViewerBg, string> = {
  neutro: 'Neutro',
  brand: 'Brand',
  claro: 'Claro',
};

function getModelExtension(url: string): 'stl' | 'ply' | 'obj' {
  const lower = url.toLowerCase();
  // Soportar hint en hash para blob URLs (ej. blob:...#name.ply).
  const hashIdx = lower.indexOf('#');
  if (hashIdx >= 0) {
    const hash = lower.slice(hashIdx + 1);
    if (hash.endsWith('.ply')) return 'ply';
    if (hash.endsWith('.obj')) return 'obj';
    if (hash.endsWith('.stl')) return 'stl';
  }
  try {
    const parsed = new URL(url, 'http://localhost');
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.ply')) return 'ply';
    if (pathname.endsWith('.obj')) return 'obj';
    return 'stl';
  } catch {
    const clean = lower.split('?')[0].split('#')[0];
    if (clean.endsWith('.ply')) return 'ply';
    if (clean.endsWith('.obj')) return 'obj';
    return 'stl';
  }
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const errorMessage = error instanceof Error ? error.message : '';
  return (
    <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 bg-background/90 backdrop-blur-md z-[100] rounded-[2.5rem]">
      <div className="w-16 h-16 bg-error-hl rounded-full text-error flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-error" />
      </div>
      <div className="text-center px-10">
        <h3 className="text-foreground font-bold mb-1">Error en el Motor Gráfico</h3>
        <p className="text-muted text-xs max-w-xs mb-4">
          El contexto WebGL se ha perdido o el navegador ha bloqueado la GPU. 
          {errorMessage && <span className="block mt-2 opacity-50 underline">Detalle: {errorMessage}</span>}
        </p>
        <button 
          onClick={resetErrorBoundary}
          className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary text-inverse rounded-xl text-xs font-bold transition-all"
        >
          <RefreshCcw className="w-3 h-3" />
          REINTENTAR CARGA
        </button>
      </div>
    </div>
  );
}

function Model({
  url,
  color,
  visible,
  opacity = 1,
  specularColor = '#3a4a5c',
  onPointerDown,
  onPointerMove,
  onDoubleClick,
  onMeshReady,
  onMeshUnmount,
}: {
  url: string,
  color: string,
  visible: boolean,
  opacity?: number,
  specularColor?: string,
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
  onMeshReady?: (mesh: THREE.Mesh) => void;
  onMeshUnmount?: (mesh: THREE.Mesh) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Determinar el cargador según la extensión
  const extension = getModelExtension(url);

  const loader: typeof STLLoader | typeof PLYLoader | typeof OBJLoader =
    extension === 'ply' ? PLYLoader : extension === 'obj' ? OBJLoader : STLLoader;

  const result = useLoader(loader, url);

  // Registro de meshes de superficie para la proyección de trazados (BVH).
  // Debe ir ANTES del early return por !visible para mantener el orden de hooks;
  // al ocultarse el modelo el componente retorna null → cleanup desregistra.
  useEffect(() => {
    if (!visible || !onMeshReady) return;
    const registered: THREE.Mesh[] = [];
    if (result instanceof THREE.BufferGeometry) {
      if (meshRef.current) registered.push(meshRef.current);
    } else {
      result.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) registered.push(child);
      });
    }
    for (const m of registered) onMeshReady(m);
    return () => {
      for (const m of registered) onMeshUnmount?.(m);
    };
  }, [result, visible, onMeshReady, onMeshUnmount]);

  if (!visible) return null;

  // Si es geometría plana (STL/PLY)
  if (result instanceof THREE.BufferGeometry) {
    return (
      <mesh
        ref={meshRef}
        geometry={result}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={onDoubleClick}
      >
        {/* Phong: highlights especulares suaves para percibir relieve dental,
            sin el costo de PBR/HDRI. Specular tono neutro frío. */}
        <meshPhongMaterial
          color={color}
          shininess={28}
          specular={specularColor}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity === 1}
        />
      </mesh>
    );
  }

  // Si es un objeto/grupo (OBJ)
  // Aplicamos material a los hijos
  const targetColorHex = new THREE.Color(color).getHex();
  const targetSpecularHex = new THREE.Color(specularColor).getHex();
  result.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
       const mat = child.material as THREE.MeshPhongMaterial | undefined;
       const colorMismatch = !mat || mat.color?.getHex() !== targetColorHex;
       const specMismatch = !mat || (mat.specular?.getHex?.() ?? -1) !== targetSpecularHex;
       if (colorMismatch || specMismatch) {
          child.material = new THREE.MeshPhongMaterial({
            color: color,
            shininess: 28,
            specular: new THREE.Color(specularColor),
            transparent: opacity < 1,
            opacity: opacity,
            depthWrite: opacity === 1
          });
       }
    }
  });

  return <primitive object={result} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onDoubleClick={onDoubleClick} />;
}

function Pin({ position, text, color = '#e11d48', onDelete }: { position: [number, number, number], text: string, user: string, color?: string, onDelete?: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
        />
      </mesh>

      {/* Halo de pulso */}
      <mesh>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>

      <Html zIndexRange={[100, 0]} style={{ pointerEvents: onDelete ? 'auto' : 'none' }}>
        <div className="bg-surface backdrop-blur-md border border-divider/60 rounded-lg shadow-lg select-none whitespace-nowrap" style={{ transform: 'translate(14px, -50%)' }}>
          {confirming ? (
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="text-xs text-foreground/70 font-medium">¿Eliminar?</span>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
              >
                No
              </button>
              <button
                onClick={() => onDelete?.()}
                className="text-xs text-error font-semibold hover:text-error/80 px-1.5 py-0.5 rounded transition-colors"
              >
                Sí
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              <p className="text-sm text-foreground/80 font-medium leading-none">{text}</p>
              {onDelete && (
                <button
                  onClick={() => setConfirming(true)}
                  aria-label="Eliminar anotación"
                  className="ml-1 text-muted hover:text-error transition-colors leading-none"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

type Point3D = { x: number; y: number; z: number };

function FreehandLine({ points }: { points: Point3D[] }) {
  // Overlay durante el arrastre: la cámara está bloqueada mirando la superficie,
  // la oclusión es irrelevante — depthTest off evita costo de proyección por frame.
  return (
    <Line
      points={points.map(p => [p.x, p.y, p.z] as [number, number, number])}
      color="#e11d48"
      lineWidth={2.5}
      transparent
      opacity={0.6}
      depthTest={false}
      renderOrder={999}
    />
  );
}

function PolylineRender({ points, color = '#e11d48', opacity = 1, surfaceWrap, onDelete, onDeletePoint, onEdit, onHoverChange }: {
  points: Point3D[];
  color?: string;
  opacity?: number;
  surfaceWrap: SurfaceWrap;
  onDelete?: () => void;
  onDeletePoint?: (index: number) => void;
  onEdit?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Pipeline de display: chaikin → resample → proyección al mesh + offset por
  // normal (0.12mm). La línea abraza la superficie y respeta la oclusión real.
  const displayPoints = useMemo(() => {
    if (points.length < 2) return null;
    const wrapped = points.length === 2 ? points : surfaceWrap.wrap(points, 'full');
    const vecs = wrapped.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return [...vecs, vecs[0]];
  }, [points, surfaceWrap]);

  // Punto medio para anclar el botón × de eliminar todo el trazado
  const midPoint: Point3D | null = points.length >= 2
    ? points[Math.floor(points.length / 2)]
    : points.length === 1 ? points[0] : null;

  return (
    <group>
      {/* Línea curva cerrada — lineWidth requiere Line de drei (Line2 internamente) */}
      {displayPoints && (
        <>
          {/* Pase principal: depth test normal — la línea se oculta detrás de
              geometría que la tapa; el offset por normal evita el z-fighting. */}
          <Line
            points={displayPoints}
            color={hovered && onEdit ? '#ff6b6b' : color}
            lineWidth={hovered && onEdit ? 4 : 2.5}
            transparent={opacity < 1}
            opacity={opacity}
          />
          {/* Pase fantasma: GreaterDepth dibuja SOLO la porción tapada, atenuada */}
          <Line
            points={displayPoints}
            color={color}
            lineWidth={2.5}
            transparent
            opacity={0.15}
            depthFunc={THREE.GreaterDepth}
            depthWrite={false}
          />
          {/* Hit-line ancha invisible: clic fácil sobre el lazo sin puntería fina.
              depthWrite=false — si escribiera depth activaría el fantasma encima. */}
          {onEdit && (
            <Line
              points={displayPoints}
              color={color}
              lineWidth={16}
              transparent
              opacity={0}
              depthWrite={false}
              onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHoverChange?.(true); }}
              onPointerOut={() => { setHovered(false); onHoverChange?.(false); }}
              onClick={(e) => { e.stopPropagation(); onHoverChange?.(false); onEdit(); }}
            />
          )}
        </>
      )}

      {/* Esferas en puntos de control solo durante el dibujo (onDeletePoint activo) */}
      {onDeletePoint && points.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]}>
          <mesh renderOrder={999}>
            <sphereGeometry args={[0.25, 10, 10]} />
            <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthTest={false} />
          </mesh>
          <Html zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onDeletePoint(i); }}
              aria-label="Eliminar punto"
              title="Eliminar punto"
              className="w-5 h-5 flex items-center justify-center bg-surface/90 border border-divider/60 hover:bg-error-hl rounded-full text-muted hover:text-error transition-colors shadow-sm"
              style={{ transform: 'translate(-50%, -50%)' }}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </Html>
        </group>
      ))}

      {/* Botón × en punto medio para eliminar todo el trazado */}
      {onDelete && midPoint && (
        <group position={[midPoint.x, midPoint.y, midPoint.z]}>
          <Html zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
            <div className="bg-surface backdrop-blur-md border border-divider/60 rounded-lg shadow-lg select-none whitespace-nowrap" style={{ transform: 'translate(10px, -50%)' }}>
              {confirming ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="text-xs text-foreground/70 font-medium">¿Eliminar?</span>
                  <button onClick={() => setConfirming(false)} className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors">No</button>
                  <button onClick={() => onDelete()} className="text-xs text-error font-semibold hover:text-error/80 px-1.5 py-0.5 rounded transition-colors">Sí</button>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <Spline className="w-3 h-3 text-muted" />
                  <button onClick={() => setConfirming(true)} aria-label="Eliminar trazado" className="text-muted hover:text-error transition-colors leading-none">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

interface DentalAnnotation {
  id: string;
  text: string;
  coordinates: { x: number, y: number, z: number };
  user: { fullName: string };
  color?: string;
}

interface DentalModel {
  url: string;
  subType: string;
  visible: boolean;
  opacity?: number;
}

export default function DentalViewer3D({
  models,
  annotations = [],
  polylines = [],
  onToggleLayer,
  onOpacityChange,
  onAnnotate,
  onDeleteAnnotation,
  onPolylineComplete,
  onPolylineUpdate,
  onDeletePolyline,
  canAnnotate = true,
  children
}: {
  models: DentalModel[],
  annotations?: DentalAnnotation[],
  polylines?: Array<{ id: string; points: Point3D[] }>,
  onToggleLayer?: (subType: string) => void,
  onOpacityChange?: (subType: string, opacity: number) => void,
  onAnnotate?: (coords: { x: number, y: number, z: number }) => void,
  onDeleteAnnotation?: (id: string) => void,
  onPolylineComplete?: (points: Point3D[]) => void,
  onPolylineUpdate?: (id: string, points: Point3D[]) => void,
  onDeletePolyline?: (id: string) => void,
  canAnnotate?: boolean,
  children?: React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneGroupRef = useRef<Group>(null);
  // Ref a OrbitControls para zoom imperativo desde los botones.
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAnnotateMode, setIsAnnotateMode] = useState(false);
  const [isPolylineMode, setIsPolylineMode] = useState(false);
  const [inProgressPoints, setInProgressPoints] = useState<Point3D[]>([]);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showPolylines, setShowPolylines] = useState(true);
  const [confirmingPolylineId, setConfirmingPolylineId] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [bgMode, setBgMode] = useState<ViewerBg>('brand');

  // ── Meshes de superficie para proyección de trazados (BVH) ────────────────
  const surfaceMeshesRef = useRef<Set<THREE.Mesh>>(new Set());
  const bvhCancelsRef = useRef<Map<THREE.Mesh, () => void>>(new Map());
  const [surfaceVersion, setSurfaceVersion] = useState(0);

  const handleMeshReady = useCallback((mesh: THREE.Mesh) => {
    surfaceMeshesRef.current.add(mesh);
    setSurfaceVersion(v => v + 1);
  }, []);

  const handleMeshUnmount = useCallback((mesh: THREE.Mesh) => {
    surfaceMeshesRef.current.delete(mesh);
    bvhCancelsRef.current.get(mesh)?.();
    bvhCancelsRef.current.delete(mesh);
    // El boundsTree queda cacheado en la geometría (useLoader la comparte):
    // re-montar el modelo reutiliza el BVH gratis.
    setSurfaceVersion(v => v + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(VIEWER_BG_STORAGE_KEY) as ViewerBg | null;
    if (saved && saved in VIEWER_BG_COLORS) setBgMode(saved);
  }, []);

  const setBgModePersist = useCallback((mode: ViewerBg) => {
    setBgMode(mode);
    try { window.localStorage.setItem(VIEWER_BG_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, []);

  // Máquina de estados del trazo freehand. Refs mutables: las muestras llegan a
  // frecuencia de pointermove y no deben depender de closures con estado stale.
  const inProgressRef = useRef<Point3D[]>([]);
  const drawRef = useRef<{
    phase: 'idle' | 'pending' | 'dragging';
    candidate: Point3D | null;
    startScreen: { x: number; y: number };
    lastScreen: { x: number; y: number };
    leftStart: boolean;
  }>({ phase: 'idle', candidate: null, startScreen: { x: 0, y: 0 }, lastScreen: { x: 0, y: 0 }, leftStart: false });
  const [isFreehandDragging, setIsFreehandDragging] = useState(false);

  const setControlsEnabled = useCallback((enabled: boolean) => {
    if (controlsRef.current) controlsRef.current.enabled = enabled;
  }, []);

  const syncInProgress = useCallback((pts: Point3D[]) => {
    inProgressRef.current = pts;
    setInProgressPoints(pts);
  }, []);

  const resetStroke = useCallback(() => {
    drawRef.current.phase = 'idle';
    drawRef.current.candidate = null;
    setIsFreehandDragging(false);
    setControlsEnabled(true);
  }, [setControlsEnabled]);

  const cancelDrawing = useCallback(() => {
    syncInProgress([]);
    drawRef.current.leftStart = false;
    resetStroke();
    setIsPolylineMode(false);
  }, [syncInProgress, resetStroke]);

  const completeWithPoints = useCallback((pts: Point3D[]) => {
    // Conservar fidelidad de superficie: los puntos vienen del mesh (e.point =
    // intersección 3D real). Deduplicar a 0.3mm y capear al límite del servidor
    // (MAX_POLYLINE_POINTS=500) resampleando por arco si el trazo es muy largo.
    const cleaned = capClosedPolyline(
      dedupeConsecutive(pts, 0.3),
      PERSIST_MAX_POINTS,
      PERSIST_RESAMPLE_TARGET,
    );
    if (cleaned.length >= 2) {
      onPolylineComplete?.(cleaned);
    }
    syncInProgress([]);
    drawRef.current.leftStart = false;
    resetStroke();
    setIsPolylineMode(false);
  }, [onPolylineComplete, syncInProgress, resetStroke]);

  const finalizePolyline = useCallback(() => {
    completeWithPoints(inProgressRef.current);
  }, [completeWithPoints]);

  /** Proyección a px de pantalla del primer punto del trazo (para el cierre automático). */
  const projectFirstPointToScreen = useCallback((camera: THREE.Camera, canvas: HTMLCanvasElement) => {
    const first = inProgressRef.current[0];
    if (!first || !sceneGroupRef.current) return null;
    const v = new THREE.Vector3(first.x, first.y, first.z);
    sceneGroupRef.current.localToWorld(v);
    v.project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }, []);

  const handleStrokePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!sceneGroupRef.current || e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    const cursor = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const canvas = e.nativeEvent.target as HTMLCanvasElement;
    const startProj = projectFirstPointToScreen(e.camera, canvas);
    if (startProj) {
      const toStart = screenDist(cursor, startProj);
      if (toStart > CLOSE_ARM_PX) drawRef.current.leftStart = true;
      else if (
        drawRef.current.leftStart &&
        toStart < CLOSE_SNAP_PX &&
        inProgressRef.current.length >= MIN_POINTS_TO_CLOSE
      ) {
        completeWithPoints(inProgressRef.current);
        return;
      }
    }
    // Bloquea OrbitControls: arrastrar sobre el mesh dibuja; sobre el fondo sigue rotando.
    setControlsEnabled(false);
    const local = sceneGroupRef.current.worldToLocal(e.point.clone());
    drawRef.current.phase = 'pending';
    drawRef.current.candidate = { x: local.x, y: local.y, z: local.z };
    drawRef.current.startScreen = cursor;
    drawRef.current.lastScreen = cursor;
  }, [projectFirstPointToScreen, completeWithPoints, setControlsEnabled]);

  const handleStrokePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const d = drawRef.current;
    if (d.phase === 'idle' || !sceneGroupRef.current) return;
    const cursor = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const canvas = e.nativeEvent.target as HTMLCanvasElement;

    if (d.phase === 'pending') {
      if (screenDist(cursor, d.startScreen) <= DRAG_THRESHOLD_PX) return;
      d.phase = 'dragging';
      setIsFreehandDragging(true);
      if (d.candidate) syncInProgress([...inProgressRef.current, d.candidate]);
      d.candidate = null;
      d.lastScreen = d.startScreen;
    }

    if (screenDist(cursor, d.lastScreen) < SAMPLE_MIN_PX) return;

    const startProj = projectFirstPointToScreen(e.camera, canvas);
    if (startProj) {
      const toStart = screenDist(cursor, startProj);
      if (toStart > CLOSE_ARM_PX) d.leftStart = true;
      else if (d.leftStart && toStart < CLOSE_SNAP_PX && inProgressRef.current.length >= MIN_POINTS_TO_CLOSE) {
        completeWithPoints(inProgressRef.current);
        return;
      }
    }

    const local = sceneGroupRef.current.worldToLocal(e.point.clone());
    const p = { x: local.x, y: local.y, z: local.z };
    const last = inProgressRef.current[inProgressRef.current.length - 1];
    if (!last || dist3(last, p) > 1e-6) {
      syncInProgress([...inProgressRef.current, p]);
    }
    d.lastScreen = cursor;
  }, [projectFirstPointToScreen, completeWithPoints, syncInProgress]);

  // ── Edición por nodos de un trazado guardado ──────────────────────────────
  const [editingPolylineId, setEditingPolylineId] = useState<string | null>(null);
  const [editingPoints, setEditingPoints] = useState<Point3D[]>([]);
  const editingPointsRef = useRef<Point3D[]>([]);
  const nodeDragRef = useRef<number | null>(null);
  const [isNodeDragging, setIsNodeDragging] = useState(false);

  // Gating del build BVH: solo cuando hay trazados o modo trazado/edición activo.
  // Visores sin trazados no pagan CPU (0.5-2s por malla grande) ni memoria del BVH.
  const needsSurfaceProjection = polylines.length > 0 || isPolylineMode || editingPolylineId !== null;
  useEffect(() => {
    if (!needsSurfaceProjection) return;
    for (const mesh of surfaceMeshesRef.current) {
      if (bvhCancelsRef.current.has(mesh)) continue;
      bvhCancelsRef.current.set(
        mesh,
        scheduleBoundsTree(mesh.geometry, () => setSurfaceVersion(v => v + 1)),
      );
    }
  }, [needsSurfaceProjection, surfaceVersion, polylines.length]);

  // Servicio de proyección para los renders de trazados. `version` invalida los
  // memos downstream cuando se registra un mesh o termina un build de BVH.
  const surfaceWrap = useMemo<SurfaceWrap>(() => ({
    version: surfaceVersion,
    wrap: (pts, quality) => {
      const meshes = [...surfaceMeshesRef.current];
      const home = pickHomeMesh(pts, meshes);
      return quality === 'drag'
        ? wrapClosedPolylineToSurface(pts, home, { spacing: 0.7, iterations: 1 })
        : wrapClosedPolylineToSurface(pts, home);
    },
  }), [surfaceVersion]);

  const syncEditingPoints = useCallback((pts: Point3D[]) => {
    editingPointsRef.current = pts;
    setEditingPoints(pts);
  }, []);

  const stopEditingPolyline = useCallback((save: boolean) => {
    if (save && editingPolylineId && onPolylineUpdate && editingPointsRef.current.length >= 2) {
      // Cap también al editar: la action de update rechaza >500 puntos y hay
      // trazados legacy densos creados antes de que el cap existiera.
      onPolylineUpdate(
        editingPolylineId,
        capClosedPolyline(editingPointsRef.current, PERSIST_MAX_POINTS, PERSIST_RESAMPLE_TARGET),
      );
    }
    setEditingPolylineId(null);
    syncEditingPoints([]);
    nodeDragRef.current = null;
    setIsNodeDragging(false);
    setControlsEnabled(true);
  }, [editingPolylineId, onPolylineUpdate, syncEditingPoints, setControlsEnabled]);

  const startEditingPolyline = useCallback((pl: { id: string; points: Point3D[] }) => {
    if (isPolylineMode) cancelDrawing();
    setIsAnnotateMode(false);
    setEditingPolylineId(pl.id);
    syncEditingPoints(pl.points.map(p => ({ ...p })));
  }, [isPolylineMode, cancelDrawing, syncEditingPoints]);

  const handleNodePointerDown = useCallback((index: number, e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    setControlsEnabled(false);
    document.body.style.cursor = 'grabbing';
    nodeDragRef.current = index;
    setIsNodeDragging(true);
  }, [setControlsEnabled]);

  // Cursor sobre el lazo (curva o nodo): bloquear la cámara para que un clic
  // levemente desviado no rote el modelo — comportamiento estándar CAD.
  const handleEditHoverChange = useCallback((hovering: boolean) => {
    if (nodeDragRef.current !== null) return;
    setControlsEnabled(!hovering);
    document.body.style.cursor = hovering ? 'grab' : '';
  }, [setControlsEnabled]);

  // Los puntos tomados de la curva de display flotan +0.12mm sobre el mesh
  // (offset por normal); antes de convertirlos en nodos crudos se devuelven
  // a la superficie contra el mesh dueño del trazado en edición.
  const snapToEditingSurface = useCallback((p: Point3D): Point3D => {
    const home = pickHomeMesh(editingPointsRef.current, [...surfaceMeshesRef.current]);
    if (!home) return p;
    const hit = closestSurfacePoint(home, p);
    return hit ? hit.point : p;
  }, []);

  // Agarrar la curva en cualquier punto: toma el nodo más cercano si está a
  // mano; si no, inserta un nodo nuevo justo donde se agarró y lo arrastra.
  const handleCurvePointerDown = useCallback((worldPoint: THREE.Vector3, e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0 || !sceneGroupRef.current) return;
    e.stopPropagation();
    setControlsEnabled(false);
    document.body.style.cursor = 'grabbing';
    const local = sceneGroupRef.current.worldToLocal(worldPoint.clone());
    const p = snapToEditingSurface({ x: local.x, y: local.y, z: local.z });
    const pts = editingPointsRef.current;
    let nearest = 0;
    let nearestDist = Infinity;
    pts.forEach((q, i) => {
      const d = dist3(p, q);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    });
    if (nearestDist <= CURVE_GRAB_NODE_RADIUS) {
      nodeDragRef.current = nearest;
    } else {
      let seg = 0;
      let segDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = distToSegment(p, pts[i], pts[(i + 1) % pts.length]);
        if (d < segDist) { segDist = d; seg = i; }
      }
      syncEditingPoints([...pts.slice(0, seg + 1), p, ...pts.slice(seg + 1)]);
      nodeDragRef.current = seg + 1;
    }
    setIsNodeDragging(true);
  }, [setControlsEnabled, syncEditingPoints, snapToEditingSurface]);

  // El mesh dental entrega el punto de superficie: el nodo activo se re-proyecta ahí.
  // Si el rayo no toca el mesh, no llega evento y el nodo conserva su última posición válida.
  const handleNodeDragMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const i = nodeDragRef.current;
    if (i === null || !sceneGroupRef.current) return;
    const local = sceneGroupRef.current.worldToLocal(e.point.clone());
    const pts = editingPointsRef.current.slice();
    pts[i] = { x: local.x, y: local.y, z: local.z };
    syncEditingPoints(pts);
  }, [syncEditingPoints]);

  const handleInsertNode = useCallback((segmentIndex: number) => {
    const pts = editingPointsRef.current;
    const a = pts[segmentIndex];
    const b = pts[(segmentIndex + 1) % pts.length];
    if (!a || !b) return;
    // El midpoint de una cuerda cae dentro/fuera del mesh — snapearlo a superficie.
    const mid = snapToEditingSurface({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    const next = [...pts.slice(0, segmentIndex + 1), mid, ...pts.slice(segmentIndex + 1)];
    syncEditingPoints(next);
  }, [syncEditingPoints, snapToEditingSurface]);

  const handleDeleteNode = useCallback((index: number) => {
    const pts = editingPointsRef.current;
    if (pts.length <= 3) return;
    syncEditingPoints(pts.filter((_, i) => i !== index));
  }, [syncEditingPoints]);

  // Soltar nodo (pointerup global) + Esc descarta la edición.
  useEffect(() => {
    if (!editingPolylineId) return;
    const release = () => {
      if (nodeDragRef.current !== null) {
        nodeDragRef.current = null;
        setIsNodeDragging(false);
        setControlsEnabled(true);
        document.body.style.cursor = '';
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') stopEditingPolyline(false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keydown', onKey);
      setControlsEnabled(true);
      document.body.style.cursor = '';
    };
  }, [editingPolylineId, stopEditingPolyline, setControlsEnabled]);

  // Cierre del gesto (pointerup global: cubre soltar fuera del mesh o del canvas) + Esc.
  useEffect(() => {
    if (!isPolylineMode) return;
    const settle = () => {
      const d = drawRef.current;
      if (d.phase === 'pending' && d.candidate) {
        // Clic discreto: comportamiento original de punto por punto.
        syncInProgress([...inProgressRef.current, d.candidate]);
      } else if (d.phase === 'dragging') {
        // Fin de un arrastre freehand: deduplicar denso (0.3mm) conservando la
        // fidelidad de superficie — el editor subsamplea los handles visibles.
        syncInProgress(dedupeConsecutive(inProgressRef.current, 0.3));
      }
      if (d.phase !== 'idle') resetStroke();
      d.candidate = null;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancelDrawing();
    };
    window.addEventListener('pointerup', settle);
    window.addEventListener('pointercancel', settle);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
      window.removeEventListener('keydown', onKey);
      setControlsEnabled(true);
    };
  }, [isPolylineMode, syncInProgress, resetStroke, cancelDrawing, setControlsEnabled]);

  const bgColor = VIEWER_BG_COLORS[bgMode];
  const isLightBg = bgMode === 'claro';
  const specularColor = isLightBg ? '#1e293b' : '#3a4a5c';
  const ambientIntensity = isLightBg ? 0.45 : 0.75;

  /**
   * Acerca/aleja la cámara moviéndola sobre la línea cámara→target.
   * factor < 1 = zoom in (más cerca); factor > 1 = zoom out (más lejos).
   * Respeta minDistance/maxDistance de OrbitControls.
   */
  const adjustZoom = (factor: number) => {
    const c = controlsRef.current;
    if (!c) return;
    const cam = c.object as THREE.PerspectiveCamera;
    const target = c.target as THREE.Vector3;
    const offset = new THREE.Vector3().subVectors(cam.position, target);
    const newDist = offset.length() * factor;
    const min = c.minDistance ?? 0.1;
    const max = c.maxDistance ?? Infinity;
    const clamped = Math.min(Math.max(newDist, min), max);
    offset.setLength(clamped);
    cam.position.copy(target).add(offset);
    c.update();
  };

  /**
   * Restaura el encuadre inicial: el modelo está centrado en el origen por
   * <Center>, así que target (0,0,0) + posición [0,0,120] replican la carga.
   * (OrbitControls.reset() depende del estado capturado en la construcción,
   * poco confiable con zoomToCursor + makeDefault.)
   */
  const resetCamera = () => {
    const c = controlsRef.current;
    if (!c) return;
    const cam = c.object as THREE.PerspectiveCamera;
    c.target.set(0, 0, 0);
    cam.position.set(0, 0, 120);
    cam.zoom = 1;
    cam.updateProjectionMatrix();
    c.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const getColor = (subType: string) => {
    switch (subType.toLowerCase()) {
      case 'superior': return '#f8fafc';
      case 'inferior': return '#cbd5e1';
      case 'bite': return '#fbbf24';
      default: return '#94a3b8';
    }
  };

  const MODEL_LOAD_PRIORITY: Record<string, number> = { superior: 0, inferior: 1, bite: 2 };
  const validModels = models
    .filter(m => !!m.url)
    .sort((a, b) => (MODEL_LOAD_PRIORITY[a.subType.toLowerCase()] ?? 3) - (MODEL_LOAD_PRIORITY[b.subType.toLowerCase()] ?? 3));

  return (
    <div 
      ref={containerRef}
      style={{ backgroundColor: bgColor }}
      className={`w-full rounded-[2.5rem] border border-divider overflow-hidden relative group shadow-2xl transition-all ${
        isFullscreen ? 'h-screen fixed inset-0 z-[9999] rounded-none' : 'h-[600px]'
      } ${(isAnnotateMode || isPolylineMode) ? 'cursor-crosshair' : 'cursor-default'}`}
    >

      <ErrorBoundary 
        FallbackComponent={ErrorFallback} 
        onReset={() => setMountKey(prev => prev + 1)}
        key={mountKey}
      >
        <Canvas
          camera={{ position: [0, 0, 120], fov: 45 }}
          // `always` es necesario para que el damping de OrbitControls glidee suavemente
          // (con `demand` el damping queda sin frames intermedios y produce stutter).
          frameloop="always"
          // Cap a 2x evita render 4-9x en pantallas retina/M-series y elimina lag por GPU saturada.
          dpr={[1, 2]}
          style={{ background: bgColor }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
          }}
        >
          <color attach="background" args={[bgColor]} />

          {/* Iluminación manual ligera: reemplaza <Stage> de drei que cargaba HDRI environment
              (costo enorme con meshStandard + mallas dentales de 200k-1M tris).
              `ambientIntensity` baja en modo Claro para evitar sobre-exposición de modelos cream. */}
          <ambientLight intensity={ambientIntensity} />
          <directionalLight position={[10, 10, 5]} intensity={0.95} />
          <directionalLight position={[-10, -10, -5]} intensity={0.35} />

          {/* `key` derivado de las URLs de los modelos: el centrado se recalcula
              solo cuando cambian los modelos, NO al agregar/editar pins. */}
          <Center key={validModels.map(m => m.url).join('|')}>
            <group ref={sceneGroupRef}>
              {/* Suspense + ErrorBoundary por modelo: carga progresiva (superior primero)
                  y aislamiento de errores — un STL corrupto no bloquea los demás. */}
              {validModels.map((m, idx) => (
                <ErrorBoundary key={`${m.subType}-${idx}`} fallback={null}>
                  <Suspense fallback={null}>
                    <Model
                      url={m.url}
                      color={getColor(m.subType)}
                      visible={m.visible}
                      opacity={m.opacity ?? 1}
                      specularColor={specularColor}
                      onPointerDown={(e) => {
                        if (isAnnotateMode && sceneGroupRef.current) {
                          e.stopPropagation();
                          const local = sceneGroupRef.current.worldToLocal(e.point.clone());
                          onAnnotate?.({ x: local.x, y: local.y, z: local.z });
                          setIsAnnotateMode(false);
                        } else if (isPolylineMode) {
                          handleStrokePointerDown(e);
                        }
                      }}
                      onPointerMove={isPolylineMode ? handleStrokePointerMove : (editingPolylineId ? handleNodeDragMove : undefined)}
                      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                        if (isPolylineMode) {
                          e.stopPropagation();
                          finalizePolyline();
                        }
                      }}
                      onMeshReady={handleMeshReady}
                      onMeshUnmount={handleMeshUnmount}
                    />
                  </Suspense>
                </ErrorBoundary>
              ))}

                {showAnnotations && annotations.map(anno => (
                  <Pin
                    key={anno.id}
                    position={[anno.coordinates.x, anno.coordinates.y, anno.coordinates.z]}
                    text={anno.text}
                    user={anno.user?.fullName || 'Usuario'}
                    color={anno.color}
                    onDelete={onDeleteAnnotation ? () => onDeleteAnnotation(anno.id) : undefined}
                  />
                ))}

                <group visible={showPolylines}>
                  {polylines.filter(pl => pl.id !== editingPolylineId).map(pl => (
                    <PolylineRender
                      key={pl.id}
                      points={pl.points}
                      color="#e11d48"
                      surfaceWrap={surfaceWrap}
                      onEdit={canAnnotate && onPolylineUpdate && !isPolylineMode && !editingPolylineId
                        ? () => startEditingPolyline(pl)
                        : undefined}
                    />
                  ))}
                </group>

                {editingPolylineId && editingPoints.length > 0 && (
                  <PolylineNodeEditor
                    points={editingPoints}
                    surfaceWrap={surfaceWrap}
                    isNodeDragging={isNodeDragging}
                    onNodePointerDown={handleNodePointerDown}
                    onCurvePointerDown={handleCurvePointerDown}
                    onHoverChange={handleEditHoverChange}
                    onInsertNode={handleInsertNode}
                    onDeleteNode={handleDeleteNode}
                  />
                )}

                {/* Durante el arrastre freehand: render ligero (Line directa, sin CatmullRom
                    ni un <Html> por muestra — cientos de nodos DOM congelarían el frame). */}
                {inProgressPoints.length > 0 && (
                  isFreehandDragging ? (
                    inProgressPoints.length >= 2 && (
                      <FreehandLine points={inProgressPoints} />
                    )
                  ) : (
                    <PolylineRender
                      points={inProgressPoints}
                      color="#e11d48"
                      opacity={0.6}
                      surfaceWrap={surfaceWrap}
                      onDeletePoint={(i) => syncInProgress(inProgressRef.current.filter((_, idx) => idx !== i))}
                    />
                  )
                )}
              </group>
            </Center>

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping={true}
            dampingFactor={0.15}
            screenSpacePanning={true}
            zoomToCursor={true}
          />
        </Canvas>
      </ErrorBoundary>

      {/* Interface Overlay — panel flotante compacto + toggle. z-[150] supera el zIndexRange de Html R3F (max 100) */}
      <div className="absolute top-4 right-4 z-[150]">
        {!panelOpen ? (
          <button
            onClick={() => setPanelOpen(true)}
            aria-label="Mostrar controles del visor"
            title="Mostrar controles"
            className="p-2.5 bg-surface backdrop-blur-md rounded-xl border border-divider shadow-lg text-muted hover:text-foreground hover:bg-surface-off transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-56 bg-surface backdrop-blur-md rounded-xl border border-divider shadow-xl overflow-hidden">
            {/* Header con close */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-divider">
              <span className="text-xs uppercase font-bold tracking-wider text-muted">Controles</span>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Ocultar controles"
                title="Ocultar"
                className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-off transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Capas */}
            {models.length > 0 && (
              <div className="p-2 space-y-1 border-b border-divider">
                {models.map((m) => (
                  <div key={m.subType} className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleLayer?.(m.subType)}
                      className={`flex-1 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                        m.visible ? 'bg-primary-hl text-foreground' : 'hover:bg-surface-off text-muted'
                      }`}
                    >
                      <span className="text-xs uppercase font-bold tracking-tight truncate">{m.subType}</span>
                      {m.visible ? <Eye className="w-3 h-3 shrink-0" /> : <EyeOff className="w-3 h-3 shrink-0 opacity-50" />}
                    </button>
                    {m.visible && (
                      <input
                        type="range" min="0.1" max="1" step="0.05"
                        value={m.opacity ?? 1}
                        onChange={(e) => onOpacityChange?.(m.subType, parseFloat(e.target.value))}
                        aria-label={`Opacidad ${m.subType}`}
                        className="w-14 h-1 bg-surface-2 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Comentarios — toggle mostrar/ocultar pins de anotación */}
            {annotations.length > 0 && (
              <div className="p-2 border-b border-divider">
                <button
                  onClick={() => setShowAnnotations((v) => !v)}
                  aria-pressed={showAnnotations}
                  title={showAnnotations ? 'Ocultar comentarios' : 'Mostrar comentarios'}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                    showAnnotations ? 'bg-primary-hl text-foreground' : 'hover:bg-surface-off text-muted'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-tight">
                    {showAnnotations ? <MessageSquare className="w-3 h-3 shrink-0" /> : <MessageSquareOff className="w-3 h-3 shrink-0 opacity-50" />}
                    Comentarios
                    <span className="text-muted font-semibold normal-case">({annotations.length})</span>
                  </span>
                  {showAnnotations ? <Eye className="w-3 h-3 shrink-0" /> : <EyeOff className="w-3 h-3 shrink-0 opacity-50" />}
                </button>
              </div>
            )}

            {/* Trazados — toggle + lista con eliminar por ítem */}
            {(polylines.length > 0 || inProgressPoints.length > 0 || isPolylineMode) && (
              <div className="p-2 border-b border-divider space-y-1">
                {/* Header toggle */}
                <button
                  onClick={() => setShowPolylines((v) => !v)}
                  aria-pressed={showPolylines}
                  title={showPolylines ? 'Ocultar trazados' : 'Mostrar trazados'}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                    showPolylines ? 'bg-primary-hl text-foreground' : 'hover:bg-surface-off text-muted'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-tight">
                    <Spline className="w-3 h-3 shrink-0" />
                    Trazados
                    <span className="text-muted font-semibold normal-case">({polylines.length})</span>
                  </span>
                  {showPolylines ? <Eye className="w-3 h-3 shrink-0" /> : <EyeOff className="w-3 h-3 shrink-0 opacity-50" />}
                </button>

                {/* Lista de trazados guardados con doble confirmación de borrado */}
                {showPolylines && (onDeletePolyline || onPolylineUpdate) && polylines.length > 0 && (
                  <div className="space-y-0.5 pt-0.5">
                    {polylines.map((pl, idx) => (
                      <div key={pl.id} className="rounded-lg overflow-hidden">
                        {editingPolylineId === pl.id ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-primary-hl">
                            <Pencil className="w-3 h-3 text-primary shrink-0" />
                            <span className="text-xs text-primary font-medium flex-1">Editando zona {idx + 1}</span>
                            <button
                              onClick={() => stopEditingPolyline(true)}
                              className="text-xs text-primary font-semibold hover:text-primary/80 px-1.5 py-0.5 rounded transition-colors"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => stopEditingPolyline(false)}
                              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                            >
                              Descartar
                            </button>
                          </div>
                        ) : confirmingPolylineId === pl.id ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-error-hl">
                            <span className="text-xs text-error font-medium flex-1">¿Eliminar zona {idx + 1}?</span>
                            <button
                              onClick={() => setConfirmingPolylineId(null)}
                              className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                            >
                              No
                            </button>
                            <button
                              onClick={() => { onDeletePolyline?.(pl.id); setConfirmingPolylineId(null); }}
                              className="text-xs text-error font-semibold hover:text-error/80 px-1.5 py-0.5 rounded transition-colors"
                            >
                              Sí
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-1 hover:bg-surface-off group">
                            <Spline className="w-3 h-3 text-error shrink-0" />
                            <span className="text-xs text-muted flex-1">Zona {idx + 1}</span>
                            {onPolylineUpdate && canAnnotate && (
                              <button
                                onClick={() => startEditingPolyline(pl)}
                                aria-label={`Editar zona ${idx + 1}`}
                                title="Editar nodos"
                                className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition-all"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            {onDeletePolyline && (
                              <button
                                onClick={() => setConfirmingPolylineId(pl.id)}
                                aria-label={`Eliminar zona ${idx + 1}`}
                                className="opacity-0 group-hover:opacity-100 text-muted hover:text-error transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {inProgressPoints.length > 0 && (
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-xs text-muted flex-1">{inProgressPoints.length} puntos</span>
                    <button
                      onClick={finalizePolyline}
                      disabled={inProgressPoints.length < 2}
                      className="text-xs text-primary font-semibold hover:text-primary/80 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40"
                    >
                      Finalizar
                    </button>
                    <button
                      onClick={cancelDrawing}
                      className="text-xs text-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {isPolylineMode && (
                  <p className="text-[10px] text-muted px-2 pt-0.5 leading-snug">
                    Arrastra para dibujar libre · clic para puntos · acércate al inicio para cerrar · Esc cancela
                  </p>
                )}
              </div>
            )}

            {/* Fondo del visor */}
            <div className="p-2 space-y-1.5 border-b border-divider">
              <p className="text-xs uppercase font-bold tracking-wider text-muted">Fondo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['neutro', 'brand', 'claro'] as ViewerBg[]).map((mode) => {
                  const active = bgMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBgModePersist(mode)}
                      aria-pressed={active}
                      className={`relative py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                        active
                          ? 'bg-primary-hl text-primary border border-primary/30'
                          : 'text-muted hover:bg-surface-off border border-divider'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle ring-1 ring-divider/60"
                        style={{ backgroundColor: VIEWER_BG_COLORS[mode] }}
                      />
                      {VIEWER_BG_LABELS[mode]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hint de navegación */}
            <div className="px-3 py-1.5 border-b border-divider">
              <p className="text-[10px] text-muted leading-snug">
                Rotar: arrastrar · Mover: clic derecho · Zoom: scroll sobre el modelo · ⟳ centrar
              </p>
            </div>

            {/* Zoom + acciones en una sola fila */}
            <div className="flex items-center gap-1 p-2">
              <button
                onClick={() => adjustZoom(0.82)}
                aria-label="Acercar"
                title="Acercar"
                className="flex-1 inline-flex items-center justify-center py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-off transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => adjustZoom(1.22)}
                aria-label="Alejar"
                title="Alejar"
                className="flex-1 inline-flex items-center justify-center py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-off transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={resetCamera}
                aria-label="Centrar modelo"
                title="Centrar modelo"
                className="flex-1 inline-flex items-center justify-center py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-off transition-colors"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>

              {canAnnotate && (
                <button
                  onClick={() => { setIsAnnotateMode(!isAnnotateMode); setIsPolylineMode(false); }}
                  aria-label={isAnnotateMode ? 'Salir de modo anotación' : 'Anotar punto'}
                  title={isAnnotateMode ? 'Salir' : 'Anotar'}
                  className={`flex-1 inline-flex items-center justify-center py-2 rounded-lg transition-colors ${
                    isAnnotateMode ? 'bg-error-hl text-error' : 'text-muted hover:text-foreground hover:bg-surface-off'
                  }`}
                >
                  {isAnnotateMode ? <MessageSquarePlus className="w-4 h-4 animate-pulse" /> : <Navigation className="w-4 h-4" />}
                </button>
              )}

              {onPolylineComplete && (
                <button
                  onClick={() => {
                    if (isPolylineMode) {
                      cancelDrawing();
                    } else {
                      if (editingPolylineId) stopEditingPolyline(false);
                      setIsPolylineMode(true);
                      setIsAnnotateMode(false);
                    }
                  }}
                  aria-label={isPolylineMode ? 'Salir de modo trazado' : 'Trazar delimitación'}
                  title={isPolylineMode ? 'Salir del trazado' : 'Trazar'}
                  className={`flex-1 inline-flex items-center justify-center py-2 rounded-lg transition-colors ${
                    isPolylineMode ? 'bg-error-hl text-error' : 'text-muted hover:text-foreground hover:bg-surface-off'
                  }`}
                >
                  <Spline className={`w-4 h-4 ${isPolylineMode ? 'animate-pulse' : ''}`} />
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                aria-label="Pantalla completa"
                title="Pantalla completa"
                className="flex-1 inline-flex items-center justify-center py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-off transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>



      {children}
    </div>
  );
}
