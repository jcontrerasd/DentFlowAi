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
  capClosedPolyline,
  closedArcDistancesFrom,
  closedPerimeter,
  falloffRadiusForLoop,
  falloffWeight,
  spliceClosedPolyline,
  PERSIST_MAX_POINTS,
  PERSIST_RESAMPLE_TARGET,
  SURFACE_OFFSET_MM,
} from '@/lib/viewer3d/polylineGeometry';
import { useToast } from '@/context/ToastContext';
import {
  installBVHRaycast,
  scheduleBoundsTree,
  closestSurfacePoint,
  pickHomeMesh,
  ridgePathBetween,
  snapToRidge,
  wrapClosedPolylineToSurface,
  type SurfaceWrap,
} from '@/lib/viewer3d/surfaceProjection';
import PolylineNodeEditor, { type PolylineNodeEditorHandle } from '@/components/viewer3d/PolylineNodeEditor';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Magnet,
  Maximize2,
  MessageSquare,
  PenLine,
  Redo2,
  Undo2,
  Wand2,
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
// Pincel de deformación constante en PANTALLA (estilo 3Shape): el radio de
// influencia en mm se deriva del zoom al iniciar el drag — acercarse permite
// ajustes finos; alejarse mueve tramos amplios.
const BRUSH_RADIUS_PX = 26;
const BRUSH_RADIUS_MIN_MM = 0.4;
const BRUSH_RADIUS_MAX_MM = 5;
// Guarda corta de re-proyección DURANTE el drag: evita que un punto salte a un
// pliegue lejano de la superficie (surco oclusal). El wrap completo al soltar
// re-converge lo que quede a medio camino.
const DRAG_PROJECT_MAX_MM = 2.5;

// Imán al filo: radio de búsqueda constante en pantalla (px → mm según zoom).
const MAGNET_RADIUS_PX = 12;
const MAGNET_RADIUS_MIN_MM = 0.3;
const MAGNET_RADIUS_MAX_MM = 1.5;

/** mm de mundo que cubren `px` píxeles a la profundidad de `worldPoint`. */
function pixelsToWorldAt(camera: THREE.Camera, worldPoint: THREE.Vector3, rectHeight: number, px: number): number {
  const cam = camera as THREE.PerspectiveCamera;
  if (!cam.isPerspectiveCamera || rectHeight <= 0) return 0;
  const dist = cam.position.distanceTo(worldPoint);
  return ((2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / rectHeight) * px;
}

// Temps módulo-level para el drag imperativo (cero allocations por pointermove).
const _dragRaycaster = new THREE.Raycaster();
(_dragRaycaster as unknown as { firstHitOnly: boolean }).firstHitOnly = true; // three-mesh-bvh
const _dragNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane();
const _dragVecA = new THREE.Vector3();
const _dragVecB = new THREE.Vector3();

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
    const wrapped = points.length === 2 ? points : surfaceWrap.wrap(points);
    const vecs = wrapped.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return [...vecs, vecs[0]];
  }, [points, surfaceWrap]);

  // Geometría barata para la hit-line: tiene handlers de puntero → se raycastea
  // en CADA pointermove, y el raycast de Line2 recorre todos los segmentos.
  // Subsamplear mantiene el orbitar fluido; los 16px de tolerancia absorben la
  // desviación de la cuerda.
  const hitPoints = useMemo(() => {
    if (!displayPoints) return null;
    const stride = Math.max(1, Math.ceil(displayPoints.length / 120));
    if (stride === 1) return displayPoints;
    const sub = displayPoints.filter((_, i) => i % stride === 0);
    sub.push(displayPoints[0]);
    return sub;
  }, [displayPoints]);

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
          {onEdit && hitPoints && (
            <Line
              points={hitPoints}
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
    // Para el muestreo por window-pointermove (raycast propio + puente sobre huecos):
    camera: THREE.Camera | null;
    canvas: HTMLCanvasElement | null;
    lastHitMesh: THREE.Mesh | null; // último mesh con impacto — ancla del puente
  }>({
    phase: 'idle', candidate: null, startScreen: { x: 0, y: 0 }, lastScreen: { x: 0, y: 0 },
    leftStart: false, camera: null, canvas: null, lastHitMesh: null,
  });
  const [isFreehandDragging, setIsFreehandDragging] = useState(false);
  // Imán al filo: atrae el trazo/arrastre al borde de máxima curvatura cercano.
  // Ref espejo para los listeners imperativos (window pointermove).
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const magnetRef = useRef(true);
  const toggleMagnet = useCallback(() => {
    setMagnetEnabled(v => {
      magnetRef.current = !v;
      return !v;
    });
  }, []);
  const { showError } = useToast();
  // Submodo redibujar (en edición): dibujar encima de un tramo lo reemplaza (splice).
  const [isRedrawMode, setIsRedrawMode] = useState(false);
  const redrawRef = useRef(false);
  const setRedrawMode = useCallback((on: boolean) => {
    redrawRef.current = on;
    setIsRedrawMode(on);
  }, []);
  // Modo asistido (en trazado): clics ponen anclas sobre el filo y el camino
  // entre anclas se calcula solo, siguiendo el margen (ridgePathBetween).
  const [isAssistMode, setIsAssistMode] = useState(false);
  const assistRef = useRef(false);
  const assistAnchorsRef = useRef<Array<{ p: Point3D; mesh: THREE.Mesh | null }>>([]);

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
    assistAnchorsRef.current = [];
    assistRef.current = false;
    setIsAssistMode(false);
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
    assistAnchorsRef.current = [];
    assistRef.current = false;
    setIsAssistMode(false);
    resetStroke();
    setIsPolylineMode(false);
  }, [onPolylineComplete, syncInProgress, resetStroke]);

  const finalizePolyline = useCallback(() => {
    completeWithPoints(inProgressRef.current);
  }, [completeWithPoints]);

  /** Cierra el lazo asistido: último ancla → primera por el filo, y completa. */
  const closeAssistLoop = useCallback(() => {
    const anchors = assistAnchorsRef.current;
    if (anchors.length < 3) return;
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    let closing: Point3D[] = [];
    if (first.mesh && first.mesh === last.mesh) {
      closing = ridgePathBetween(first.mesh, last.p, first.p).slice(1, -1);
    }
    completeWithPoints([...inProgressRef.current, ...closing]);
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

    // Modo asistido: cada clic pone un ancla (imantada al filo) y el tramo
    // desde el ancla anterior se calcula solo siguiendo el margen.
    if (assistRef.current) {
      const anchors = assistAnchorsRef.current;
      const proj = projectFirstPointToScreen(e.camera, canvas);
      if (proj && anchors.length >= 3 && screenDist(cursor, proj) < CLOSE_SNAP_PX) {
        closeAssistLoop();
        return;
      }
      const mesh = e.object as THREE.Mesh;
      const local = sceneGroupRef.current.worldToLocal(e.point.clone());
      let anchor: Point3D = { x: local.x, y: local.y, z: local.z };
      if (magnetRef.current) {
        const radius = Math.min(MAGNET_RADIUS_MAX_MM, Math.max(MAGNET_RADIUS_MIN_MM,
          pixelsToWorldAt(e.camera, e.point, canvas.clientHeight, MAGNET_RADIUS_PX)));
        const ridge = snapToRidge(mesh, anchor, Math.max(radius, 0.8));
        if (ridge) anchor = ridge;
      }
      const prev = anchors[anchors.length - 1];
      if (!prev) {
        syncInProgress([anchor]);
      } else {
        const seg = prev.mesh === mesh
          ? ridgePathBetween(mesh, prev.p, anchor)
          : [prev.p, anchor];
        syncInProgress([...inProgressRef.current, ...seg.slice(1)]);
      }
      anchors.push({ p: anchor, mesh });
      return;
    }

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
    drawRef.current.camera = e.camera;
    drawRef.current.canvas = canvas;
    drawRef.current.lastHitMesh = e.object as THREE.Mesh;
  }, [projectFirstPointToScreen, completeWithPoints, setControlsEnabled, closeAssistLoop, syncInProgress]);

  /**
   * Muestreo freehand por window-pointermove con raycast PROPIO (estilo drag):
   * el trazo ya no depende de que el rayo pegue en el mesh. Sobre huecos o
   * bordes rotos del escaneo, PUENTEA siguiendo un plano ⊥ cámara por el
   * último punto y re-pegándose a la superficie cercana si existe — el trazo
   * nunca se corta (comportamiento 3Shape).
   */
  useEffect(() => {
    if (!isPolylineMode && !isRedrawMode) return;
    const onMove = (ev: PointerEvent) => {
      const d = drawRef.current;
      const group = sceneGroupRef.current;
      if (d.phase === 'idle' || !d.camera || !d.canvas || !group) return;
      const rect = d.canvas.getBoundingClientRect();
      const cursor = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };

      if (d.phase === 'pending') {
        if (screenDist(cursor, d.startScreen) <= DRAG_THRESHOLD_PX) return;
        d.phase = 'dragging';
        setIsFreehandDragging(true);
        if (d.candidate) syncInProgress([...inProgressRef.current, d.candidate]);
        d.candidate = null;
        d.lastScreen = d.startScreen;
      }

      if (screenDist(cursor, d.lastScreen) < SAMPLE_MIN_PX) return;

      // Cierre automático solo en modo trazado — un stroke de redibujo es abierto.
      if (!redrawRef.current) {
        const startProj = projectFirstPointToScreen(d.camera, d.canvas);
        if (startProj) {
          const toStart = screenDist(cursor, startProj);
          if (toStart > CLOSE_ARM_PX) d.leftStart = true;
          else if (d.leftStart && toStart < CLOSE_SNAP_PX && inProgressRef.current.length >= MIN_POINTS_TO_CLOSE) {
            completeWithPoints(inProgressRef.current);
            return;
          }
        }
      }

      // Raycast propio contra los meshes visibles (BVH-acelerado cuando está listo).
      _dragNdc.set((cursor.x / rect.width) * 2 - 1, -(cursor.y / rect.height) * 2 + 1);
      _dragRaycaster.setFromCamera(_dragNdc, d.camera as THREE.PerspectiveCamera);
      let p: Point3D | null = null;
      const meshes = [...surfaceMeshesRef.current];
      if (meshes.length > 0) {
        const hits = _dragRaycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const hitMesh = hits[0].object as THREE.Mesh;
          const local = group.worldToLocal(hits[0].point.clone());
          p = { x: local.x, y: local.y, z: local.z };
          d.lastHitMesh = hitMesh;
          // Imán al filo: atraer la muestra al borde de curvatura cercano.
          if (magnetRef.current) {
            const radius = Math.min(MAGNET_RADIUS_MAX_MM, Math.max(MAGNET_RADIUS_MIN_MM,
              pixelsToWorldAt(d.camera, hits[0].point, rect.height, MAGNET_RADIUS_PX)));
            const ridge = snapToRidge(hitMesh, p, radius);
            if (ridge) p = ridge;
          }
        }
      }
      if (!p) {
        // PUENTE: seguir sobre un plano ⊥ cámara por el último punto del trazo
        // y re-pegar a la superficie cercana si la hay (borde del hueco).
        const last = inProgressRef.current[inProgressRef.current.length - 1];
        if (!last) return;
        _dragVecA.set(last.x, last.y, last.z);
        group.localToWorld(_dragVecA);
        (d.camera as THREE.PerspectiveCamera).getWorldDirection(_dragVecB);
        _dragPlane.setFromNormalAndCoplanarPoint(_dragVecB, _dragVecA);
        if (!_dragRaycaster.ray.intersectPlane(_dragPlane, _dragVecA)) return;
        const local = group.worldToLocal(_dragVecA);
        const snap = d.lastHitMesh
          ? closestSurfacePoint(d.lastHitMesh, { x: local.x, y: local.y, z: local.z }, DRAG_PROJECT_MAX_MM)
          : null;
        p = snap ? snap.point : { x: local.x, y: local.y, z: local.z };
      }
      const last = inProgressRef.current[inProgressRef.current.length - 1];
      if (!last || dist3(last, p) > 1e-6) {
        syncInProgress([...inProgressRef.current, p]);
      }
      d.lastScreen = cursor;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [isPolylineMode, isRedrawMode, syncInProgress, projectFirstPointToScreen, completeWithPoints]);

  // ── Edición por nodos de un trazado guardado ──────────────────────────────
  const [editingPolylineId, setEditingPolylineId] = useState<string | null>(null);
  const [editingPoints, setEditingPoints] = useState<Point3D[]>([]);
  const editingPointsRef = useRef<Point3D[]>([]);
  const nodeDragRef = useRef<number | null>(null);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  // Historial de edición (Ctrl+Z / Ctrl+Shift+Z). Cap 30 estados.
  const editHistoryRef = useRef<{ past: Point3D[][]; future: Point3D[][] }>({ past: [], future: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  const pushEditHistory = useCallback(() => {
    const h = editHistoryRef.current;
    h.past.push(editingPointsRef.current.map(p => ({ ...p })));
    if (h.past.length > 30) h.past.shift();
    h.future = [];
    setHistoryVersion(v => v + 1);
  }, []);
  const resetEditHistory = useCallback(() => {
    editHistoryRef.current = { past: [], future: [] };
    setHistoryVersion(v => v + 1);
  }, []);
  // Contexto del drag imperativo: TODO lo necesario para deformar con falloff
  // por pointermove sin pasar por React (el commit a estado ocurre al soltar).
  const nodeEditorRef = useRef<PolylineNodeEditorHandle | null>(null);
  const dragCtxRef = useRef<{
    snapshot: Point3D[];      // puntos al iniciar el drag — deformación NO acumulativa
    grabIndex: number;
    arcDists: number[];       // distancia por arco de cada punto al agarrado
    radius: number;           // radio de influencia del falloff
    affected: number[];       // índices dentro del radio (estáticos durante el drag)
    homeMesh: THREE.Mesh | null;
    display: Float32Array;    // (N+1)*3 posiciones con offset por normal (loop cerrado)
    camera: THREE.Camera;     // para el raycast propio por window-pointermove
    canvas: HTMLElement;
    magnetRadius: number;     // radio del imán al filo (mm, según zoom al iniciar)
  } | null>(null);

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
    wrap: (pts) => {
      const meshes = [...surfaceMeshesRef.current];
      return wrapClosedPolylineToSurface(pts, pickHomeMesh(pts, meshes));
    },
  }), [surfaceVersion]);

  const syncEditingPoints = useCallback((pts: Point3D[]) => {
    editingPointsRef.current = pts;
    setEditingPoints(pts);
  }, []);

  const undoEdit = useCallback(() => {
    const h = editHistoryRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(editingPointsRef.current.map(p => ({ ...p })));
    syncEditingPoints(prev);
    setHistoryVersion(v => v + 1);
  }, [syncEditingPoints]);

  const redoEdit = useCallback(() => {
    const h = editHistoryRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(editingPointsRef.current.map(p => ({ ...p })));
    syncEditingPoints(next);
    setHistoryVersion(v => v + 1);
  }, [syncEditingPoints]);

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
    dragCtxRef.current = null;
    setIsNodeDragging(false);
    setRedrawMode(false);
    resetEditHistory();
    setControlsEnabled(true);
  }, [editingPolylineId, onPolylineUpdate, syncEditingPoints, setControlsEnabled, setRedrawMode, resetEditHistory]);

  const startEditingPolyline = useCallback((pl: { id: string; points: Point3D[] }) => {
    if (isPolylineMode) cancelDrawing();
    setIsAnnotateMode(false);
    setEditingPolylineId(pl.id);
    // Editar sobre la polilínea DENSA guardada (0.3mm): la deformación con
    // falloff mueve una vecindad continua — estilo 3Shape — no un vértice.
    syncEditingPoints(pl.points.map(p => ({ ...p })));
    resetEditHistory();
  }, [isPolylineMode, cancelDrawing, syncEditingPoints, resetEditHistory]);

  /**
   * Prepara el contexto del drag imperativo: snapshot de puntos, vecindad de
   * falloff y buffer de display (puntos densos + offset por normal). Un solo
   * cálculo por drag; los pointermove posteriores solo tocan `affected`.
   */
  const beginNodeDrag = useCallback((grabIndex: number, camera: THREE.Camera, canvas: HTMLElement) => {
    const pts = editingPointsRef.current;
    const n = pts.length;
    if (n === 0) return;
    const arcDists = closedArcDistancesFrom(pts, grabIndex);
    // Radio de influencia constante en pantalla: mm por pixel a la profundidad
    // del punto agarrado × radio del pincel en px. Zoom in → radio chico →
    // ajustes finos; zoom out → radio amplio. Fallback al radio por perímetro.
    let radius = falloffRadiusForLoop(closedPerimeter(pts));
    let magnetRadius = MAGNET_RADIUS_MIN_MM;
    const rect = canvas.getBoundingClientRect();
    if (sceneGroupRef.current) {
      _dragVecA.set(pts[grabIndex].x, pts[grabIndex].y, pts[grabIndex].z);
      sceneGroupRef.current.localToWorld(_dragVecA);
      const brushMm = pixelsToWorldAt(camera, _dragVecA, rect.height, BRUSH_RADIUS_PX);
      if (brushMm > 0) {
        radius = Math.min(BRUSH_RADIUS_MAX_MM, Math.max(BRUSH_RADIUS_MIN_MM, brushMm));
      }
      const magnetMm = pixelsToWorldAt(camera, _dragVecA, rect.height, MAGNET_RADIUS_PX);
      if (magnetMm > 0) {
        magnetRadius = Math.min(MAGNET_RADIUS_MAX_MM, Math.max(MAGNET_RADIUS_MIN_MM, magnetMm));
      }
    }
    const affected: number[] = [];
    for (let j = 0; j < n; j++) {
      if (arcDists[j] < radius) affected.push(j);
    }
    const homeMesh = pickHomeMesh(pts, [...surfaceMeshesRef.current]);
    const display = new Float32Array((n + 1) * 3);
    for (let j = 0; j < n; j++) {
      const hit = homeMesh ? closestSurfacePoint(homeMesh, pts[j]) : null;
      const o = j * 3;
      display[o] = hit ? hit.point.x + hit.normal.x * SURFACE_OFFSET_MM : pts[j].x;
      display[o + 1] = hit ? hit.point.y + hit.normal.y * SURFACE_OFFSET_MM : pts[j].y;
      display[o + 2] = hit ? hit.point.z + hit.normal.z * SURFACE_OFFSET_MM : pts[j].z;
    }
    display[n * 3] = display[0];
    display[n * 3 + 1] = display[1];
    display[n * 3 + 2] = display[2];
    dragCtxRef.current = {
      snapshot: pts.map(p => ({ ...p })),
      grabIndex,
      arcDists,
      radius,
      affected,
      homeMesh,
      display,
      camera,
      canvas,
      magnetRadius,
    };
    pushEditHistory(); // estado previo al drag — Ctrl+Z lo restaura
    nodeEditorRef.current?.beginDragDisplay(display);
  }, [pushEditHistory]);

  // Cursor sobre el lazo: bloquear la cámara para que un clic levemente
  // desviado no rote el modelo — comportamiento estándar CAD.
  const handleEditHoverChange = useCallback((hovering: boolean) => {
    if (nodeDragRef.current !== null) return;
    setControlsEnabled(!hovering);
    document.body.style.cursor = hovering ? 'grab' : '';
  }, [setControlsEnabled]);

  // Agarrar la traza en cualquier punto: con la polilínea densa (0.3mm), el
  // punto más cercano al cursor ES el agarre — sin nodos ni inserciones.
  const handleCurvePointerDown = useCallback((worldPoint: THREE.Vector3, e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0 || !sceneGroupRef.current) return;
    e.stopPropagation();
    setControlsEnabled(false);
    document.body.style.cursor = 'grabbing';
    const local = sceneGroupRef.current.worldToLocal(worldPoint.clone());
    const pts = editingPointsRef.current;
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = dist3({ x: local.x, y: local.y, z: local.z }, pts[i]);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    nodeDragRef.current = nearest;
    beginNodeDrag(nearest, e.camera, e.nativeEvent.target as HTMLElement);
    setIsNodeDragging(true);
  }, [setControlsEnabled, beginNodeDrag]);

  /**
   * Aplica la deformación con falloff (estilo 3Shape) hacia `targetLocal`:
   * el punto agarrado sigue al cursor; los vecinos dentro del radio se mueven
   * con peso cos² desde el SNAPSHOT (no acumulativo) y se re-pegan a la
   * superficie. Cero setState — solo se muta el buffer de la línea; el commit
   * a React ocurre al soltar.
   */
  const applyDragFalloff = useCallback((targetLocal: Point3D) => {
    const ctx = dragCtxRef.current;
    const i = nodeDragRef.current;
    if (!ctx || i === null) return;
    const grab = ctx.snapshot[ctx.grabIndex];
    const dx = targetLocal.x - grab.x;
    const dy = targetLocal.y - grab.y;
    const dz = targetLocal.z - grab.z;
    const pts = editingPointsRef.current;
    const n = pts.length;
    for (const j of ctx.affected) {
      const w = falloffWeight(ctx.arcDists[j], ctx.radius);
      const cand = {
        x: ctx.snapshot[j].x + dx * w,
        y: ctx.snapshot[j].y + dy * w,
        z: ctx.snapshot[j].z + dz * w,
      };
      // Guarda corta: re-pegar a la superficie solo si está cerca — un surco
      // profundo a 8mm "robaría" el punto y la línea saltaría a pliegues.
      const hit = ctx.homeMesh ? closestSurfacePoint(ctx.homeMesh, cand, DRAG_PROJECT_MAX_MM) : null;
      const p = hit ? hit.point : cand;
      pts[j] = p;
      const o = j * 3;
      ctx.display[o] = p.x + (hit ? hit.normal.x * SURFACE_OFFSET_MM : 0);
      ctx.display[o + 1] = p.y + (hit ? hit.normal.y * SURFACE_OFFSET_MM : 0);
      ctx.display[o + 2] = p.z + (hit ? hit.normal.z * SURFACE_OFFSET_MM : 0);
    }
    // Mantener el cierre del lazo (el último vértice duplica al primero).
    ctx.display[n * 3] = ctx.display[0];
    ctx.display[n * 3 + 1] = ctx.display[1];
    ctx.display[n * 3 + 2] = ctx.display[2];
    nodeEditorRef.current?.updateDragDisplay(ctx.display);
  }, []);

  /**
   * Drag por window-pointermove con raycast PROPIO contra el mesh dueño:
   * - nunca se congela si el cursor sale del diente (fallback: plano ⊥ cámara
   *   por el punto de agarre + re-pegado a superficie), y
   * - nunca salta a la otra arcada (solo se raycastea el home mesh).
   */
  useEffect(() => {
    if (!isNodeDragging) return;
    const onMove = (ev: PointerEvent) => {
      const ctx = dragCtxRef.current;
      const group = sceneGroupRef.current;
      if (!ctx || !group) return;
      const rect = ctx.canvas.getBoundingClientRect();
      _dragNdc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      _dragRaycaster.setFromCamera(_dragNdc, ctx.camera as THREE.PerspectiveCamera);
      let target: Point3D | null = null;
      if (ctx.homeMesh) {
        const hits = _dragRaycaster.intersectObject(ctx.homeMesh, false);
        if (hits.length > 0) {
          const local = group.worldToLocal(hits[0].point.clone());
          target = { x: local.x, y: local.y, z: local.z };
        }
      }
      if (!target) {
        // Cursor fuera del mesh: seguir sobre un plano ⊥ cámara por el punto
        // de agarre y re-pegar a la superficie más cercana si está a mano.
        const grab = ctx.snapshot[ctx.grabIndex];
        _dragVecA.set(grab.x, grab.y, grab.z);
        group.localToWorld(_dragVecA);
        (ctx.camera as THREE.PerspectiveCamera).getWorldDirection(_dragVecB);
        _dragPlane.setFromNormalAndCoplanarPoint(_dragVecB, _dragVecA);
        if (_dragRaycaster.ray.intersectPlane(_dragPlane, _dragVecA)) {
          const local = group.worldToLocal(_dragVecA);
          const snap = ctx.homeMesh
            ? closestSurfacePoint(ctx.homeMesh, { x: local.x, y: local.y, z: local.z })
            : null;
          target = snap ? snap.point : { x: local.x, y: local.y, z: local.z };
        }
      }
      if (!target) return;
      // Imán al filo: el target del cursor se atrae al borde de curvatura
      // cercano ANTES del falloff — toda la vecindad sigue el filo.
      if (magnetRef.current && ctx.homeMesh) {
        const ridge = snapToRidge(ctx.homeMesh, target, ctx.magnetRadius);
        if (ridge) target = ridge;
      }
      applyDragFalloff(target);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [isNodeDragging, applyDragFalloff]);

  // Soltar nodo (pointerup global) + Esc descarta la edición.
  useEffect(() => {
    if (!editingPolylineId) return;
    const release = () => {
      if (nodeDragRef.current !== null) {
        nodeDragRef.current = null;
        // ÚNICO commit a React del drag imperativo: el editor re-renderiza
        // con el pipeline completo sobre los puntos deformados.
        if (dragCtxRef.current) {
          dragCtxRef.current = null;
          syncEditingPoints(editingPointsRef.current.slice());
        }
        setIsNodeDragging(false);
        setControlsEnabled(true);
        document.body.style.cursor = '';
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (redrawRef.current) {
          // Salir solo del submodo redibujar (descartando el stroke en curso).
          syncInProgress([]);
          resetStroke();
          setRedrawMode(false);
        } else {
          stopEditingPolyline(false);
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redoEdit();
        else undoEdit();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redoEdit();
      }
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
  }, [editingPolylineId, stopEditingPolyline, setControlsEnabled, syncEditingPoints,
      syncInProgress, resetStroke, setRedrawMode, undoEdit, redoEdit]);

  // Cierre del stroke de redibujo: al soltar, empalmar en el lazo (splice).
  useEffect(() => {
    if (!isRedrawMode) return;
    const settle = () => {
      const d = drawRef.current;
      if (d.phase === 'dragging') {
        const stroke = dedupeConsecutive(inProgressRef.current, 0.3);
        const spliced = stroke.length >= 2
          ? spliceClosedPolyline(editingPointsRef.current, stroke, 2.5)
          : null;
        if (spliced) {
          pushEditHistory();
          syncEditingPoints(capClosedPolyline(spliced, PERSIST_MAX_POINTS, PERSIST_RESAMPLE_TARGET));
        } else if (stroke.length >= 2) {
          showError('El trazo debe empezar y terminar sobre la línea');
        }
      }
      d.candidate = null;
      if (d.phase !== 'idle') resetStroke();
      syncInProgress([]);
    };
    window.addEventListener('pointerup', settle);
    window.addEventListener('pointercancel', settle);
    return () => {
      window.removeEventListener('pointerup', settle);
      window.removeEventListener('pointercancel', settle);
    };
  }, [isRedrawMode, syncEditingPoints, syncInProgress, resetStroke, pushEditHistory, showError]);

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
      case 'lateralderecho': return '#7dd3fc';
      case 'lateralizquierdo': return '#a5b4fc';
      default: return '#94a3b8';
    }
  };

  const LAYER_LABELS: Record<string, string> = {
    superior: 'Superior',
    inferior: 'Inferior',
    bite: 'Mordida',
    lateralderecho: 'Lateral Derecho',
    lateralizquierdo: 'Lateral Izquierdo',
  };
  const getLayerLabel = (subType: string) => {
    const known = LAYER_LABELS[subType.toLowerCase()];
    if (known) return known;
    // Fallback genérico: separa camelCase/snake_case y capitaliza cada palabra.
    return subType
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const MODEL_LOAD_PRIORITY: Record<string, number> = {
    superior: 0,
    inferior: 1,
    bite: 2,
    lateralderecho: 3,
    lateralizquierdo: 4,
  };
  const validModels = models
    .filter(m => !!m.url)
    .sort((a, b) => (MODEL_LOAD_PRIORITY[a.subType.toLowerCase()] ?? 5) - (MODEL_LOAD_PRIORITY[b.subType.toLowerCase()] ?? 5));

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
                        } else if (isPolylineMode || (editingPolylineId && isRedrawMode)) {
                          handleStrokePointerDown(e);
                        }
                      }}
                      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                        if (isPolylineMode) {
                          e.stopPropagation();
                          if (isAssistMode) closeAssistLoop();
                          else finalizePolyline();
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
                    ref={nodeEditorRef}
                    points={editingPoints}
                    surfaceWrap={surfaceWrap}
                    isNodeDragging={isNodeDragging}
                    onCurvePointerDown={handleCurvePointerDown}
                    onHoverChange={handleEditHoverChange}
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
                      <span className="text-xs uppercase font-bold tracking-tight truncate">{getLayerLabel(m.subType)}</span>
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
                          <div className="flex items-center gap-1 px-2 py-1.5 bg-primary-hl">
                            <Pencil className="w-3 h-3 text-primary shrink-0" />
                            <span className="text-xs text-primary font-medium flex-1">Zona {idx + 1}</span>
                            <button
                              onClick={undoEdit}
                              disabled={editHistoryRef.current.past.length === 0}
                              aria-label="Deshacer"
                              title="Deshacer (Ctrl+Z)"
                              className="p-1 rounded text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Undo2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={redoEdit}
                              disabled={editHistoryRef.current.future.length === 0}
                              aria-label="Rehacer"
                              title="Rehacer (Ctrl+Shift+Z)"
                              className="p-1 rounded text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Redo2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setRedrawMode(!isRedrawMode)}
                              aria-pressed={isRedrawMode}
                              aria-label="Redibujar tramo"
                              title="Redibujar tramo: dibuja encima de la sección a corregir"
                              className={`p-1 rounded transition-colors ${
                                isRedrawMode ? 'bg-primary text-inverse' : 'text-primary hover:bg-primary/10'
                              }`}
                            >
                              <PenLine className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => stopEditingPolyline(true)}
                              className="text-xs text-primary font-semibold hover:text-primary/80 px-1.5 py-0.5 rounded transition-colors"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => stopEditingPolyline(false)}
                              className="text-xs text-muted hover:text-foreground px-1 py-0.5 rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null}
                        {editingPolylineId === pl.id && (
                          <p className="text-[10px] text-muted px-2 pt-1 leading-snug">
                            {isRedrawMode
                              ? 'Dibuja sobre la línea el tramo corregido · Esc sale del redibujo'
                              : 'Toma la traza y arrástrala para moldearla · Ctrl+Z deshace · Esc descarta'}
                          </p>
                        )}
                        {editingPolylineId === pl.id ? null : confirmingPolylineId === pl.id ? (
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

                {/* Imán al filo: activo en dibujo y edición */}
                {(isPolylineMode || editingPolylineId) && (
                  <button
                    onClick={toggleMagnet}
                    aria-pressed={magnetEnabled}
                    title={magnetEnabled ? 'Desactivar imán al filo' : 'Activar imán al filo'}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
                      magnetEnabled ? 'bg-primary-hl text-primary' : 'hover:bg-surface-off text-muted'
                    }`}
                  >
                    <Magnet className="w-3 h-3 shrink-0" />
                    Imán al filo
                    <span className="ml-auto text-[10px] font-bold uppercase">{magnetEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                )}

                {/* Modo asistido: anclas + camino automático por el filo */}
                {isPolylineMode && (
                  <button
                    onClick={() => {
                      setIsAssistMode(v => {
                        assistRef.current = !v;
                        if (!v) {
                          // Al activar: descartar cualquier trazo libre en curso.
                          syncInProgress([]);
                          assistAnchorsRef.current = [];
                          resetStroke();
                        }
                        return !v;
                      });
                    }}
                    aria-pressed={isAssistMode}
                    title="Delimitado asistido: clic marca anclas y el camino sigue el filo"
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
                      isAssistMode ? 'bg-primary-hl text-primary' : 'hover:bg-surface-off text-muted'
                    }`}
                  >
                    <Wand2 className="w-3 h-3 shrink-0" />
                    Asistido
                    <span className="ml-auto text-[10px] font-bold uppercase">{isAssistMode ? 'ON' : 'OFF'}</span>
                  </button>
                )}

                {isPolylineMode && (
                  <p className="text-[10px] text-muted px-2 pt-0.5 leading-snug">
                    {isAssistMode
                      ? 'Clic marca anclas sobre el filo · el camino se completa solo · clic en la 1ª ancla o doble clic cierra · Esc cancela'
                      : 'Arrastra para dibujar libre · clic para puntos · acércate al inicio para cerrar · Esc cancela'}
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
