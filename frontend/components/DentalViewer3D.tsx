'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useLoader, type ThreeEvent } from '@react-three/fiber';
import { STLLoader, PLYLoader, OBJLoader } from '@/lib/three-loaders';
import {
  OrbitControls,
  Center,
  Html,
} from '@react-three/drei';
import type { Group } from 'three';
import * as THREE from 'three';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Maximize2,
  MessageSquarePlus,
  Navigation,
  RefreshCcw,
  Settings2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

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
  onPointerDown
}: { 
  url: string, 
  color: string, 
  visible: boolean, 
  opacity?: number,
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Determinar el cargador según la extensión
  const extension = getModelExtension(url);
  
  const loader: typeof STLLoader | typeof PLYLoader | typeof OBJLoader =
    extension === 'ply' ? PLYLoader : extension === 'obj' ? OBJLoader : STLLoader;

  const result = useLoader(loader, url);

  if (!visible) return null;

  // Si es geometría plana (STL/PLY)
  if (result instanceof THREE.BufferGeometry) {
    return (
      <mesh
        ref={meshRef}
        geometry={result}
        onPointerDown={onPointerDown}
      >
        {/* Phong: highlights especulares suaves para percibir relieve dental,
            sin el costo de PBR/HDRI. Specular tono neutro frío. */}
        <meshPhongMaterial
          color={color}
          shininess={28}
          specular="#3a4a5c"
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity === 1}
        />
      </mesh>
    );
  }

  // Si es un objeto/grupo (OBJ)
  // Aplicamos material a los hijos
  result.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
       const mat = child.material as THREE.MeshPhongMaterial | undefined;
       if (!mat || mat.color?.getHex() !== new THREE.Color(color).getHex()) {
          child.material = new THREE.MeshPhongMaterial({
            color: color,
            shininess: 28,
            specular: new THREE.Color('#3a4a5c'),
            transparent: opacity < 1,
            opacity: opacity,
            depthWrite: opacity === 1
          });
       }
    }
  });

  return <primitive object={result} onPointerDown={onPointerDown} />;
}

function Pin({ position, text, user }: { position: [number, number, number], text: string, user: string }) {
  const [hovered, setHovered] = useState(false);
  
  return (
    <group position={position}>
      <mesh 
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial 
          color="#e11d48" 
          emissive="#e11d48"
          emissiveIntensity={hovered ? 5 : 2}
        />
      </mesh>
      
      {/* Halo de pulso */}
      <mesh>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color="#e11d48" transparent opacity={0.2} />
      </mesh>
      
      <Html zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
        {hovered ? (
          <div className="bg-surface/95 backdrop-blur-md border border-divider/80 px-4 py-3 rounded-xl shadow-2xl min-w-[220px] select-none" style={{ transform: 'translate(14px, -50%)' }}>
            <p className="text-sm text-primary font-bold uppercase tracking-widest mb-1 leading-none">{user}</p>
            <p className="text-base text-foreground leading-snug font-medium">{text}</p>
          </div>
        ) : (
          <div className="bg-surface backdrop-blur-md border border-divider/60 px-2.5 py-1.5 rounded-lg shadow-lg select-none whitespace-nowrap" style={{ transform: 'translate(14px, -50%)' }}>
            <p className="text-sm text-foreground/80 font-medium leading-none">{text}</p>
          </div>
        )}
      </Html>
    </group>

  );
}

interface DentalAnnotation {
  id: string;
  text: string;
  coordinates: { x: number, y: number, z: number };
  user: { fullName: string };
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
  onToggleLayer,
  onOpacityChange,
  onAnnotate,
  canAnnotate = true,
  children
}: { 
  models: DentalModel[], 
  annotations?: DentalAnnotation[],
  onToggleLayer?: (subType: string) => void,
  onOpacityChange?: (subType: string, opacity: number) => void,
  onAnnotate?: (coords: { x: number, y: number, z: number }) => void,
  canAnnotate?: boolean,
  children?: React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneGroupRef = useRef<Group>(null);
  // Ref a OrbitControls para zoom imperativo desde los botones.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAnnotateMode, setIsAnnotateMode] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

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

  const validModels = models.filter(m => !!m.url);

  return (
    <div 
      ref={containerRef}
      style={{ backgroundColor: '#020617' }}
      className={`w-full rounded-[2.5rem] border border-divider overflow-hidden relative group shadow-2xl transition-all ${
        isFullscreen ? 'h-screen fixed inset-0 z-[9999] rounded-none' : 'h-[600px]'
      } ${isAnnotateMode ? 'cursor-crosshair' : 'cursor-default'}`}
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
          style={{ background: '#020617' }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
          }}
        >
          <color attach="background" args={['#020617']} />
          
          {/* Iluminación manual ligera: reemplaza <Stage> de drei que cargaba HDRI environment
              (costo enorme con meshStandard + mallas dentales de 200k-1M tris). */}
          <ambientLight intensity={0.75} />
          <directionalLight position={[10, 10, 5]} intensity={0.95} />
          <directionalLight position={[-10, -10, -5]} intensity={0.35} />

          <Suspense fallback={null}>
            {/* `key` derivado de las URLs de los modelos: el centrado se recalcula
                solo cuando cambian los modelos, NO al agregar/editar pins. */}
            <Center key={validModels.map(m => m.url).join('|')}>
              <group ref={sceneGroupRef}>
                {validModels.map((m, idx) => (
                  <Model
                    key={`${m.subType}-${idx}`}
                    url={m.url}
                    color={getColor(m.subType)}
                    visible={m.visible}
                    opacity={m.opacity ?? 1}
                    onPointerDown={(e) => {
                      if (isAnnotateMode && sceneGroupRef.current) {
                        e.stopPropagation();
                        const local = sceneGroupRef.current.worldToLocal(e.point.clone());
                        onAnnotate?.({ x: local.x, y: local.y, z: local.z });
                        setIsAnnotateMode(false);
                      }
                    }}
                  />
                ))}

                {annotations.map(anno => (
                  <Pin
                    key={anno.id}
                    position={[anno.coordinates.x, anno.coordinates.y, anno.coordinates.z]}
                    text={anno.text}
                    user={anno.user?.fullName || 'Usuario'}
                  />
                ))}
              </group>
            </Center>
          </Suspense>

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping={true}
          />
        </Canvas>
      </ErrorBoundary>

      {/* Interface Overlay — panel flotante compacto + toggle */}
      <div className="absolute top-4 right-4 z-20">
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
              <span className="text-[10px] uppercase font-bold tracking-wider text-faint">Controles</span>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Ocultar controles"
                title="Ocultar"
                className="p-1 rounded-md text-faint hover:text-foreground hover:bg-surface-off transition-colors"
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
                        m.visible ? 'bg-primary-hl text-foreground' : 'hover:bg-surface-off text-faint'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-tight truncate">{m.subType}</span>
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

              {canAnnotate && (
                <button
                  onClick={() => setIsAnnotateMode(!isAnnotateMode)}
                  aria-label={isAnnotateMode ? 'Salir de modo anotación' : 'Anotar punto'}
                  title={isAnnotateMode ? 'Salir' : 'Anotar'}
                  className={`flex-1 inline-flex items-center justify-center py-2 rounded-lg transition-colors ${
                    isAnnotateMode ? 'bg-error-hl text-error' : 'text-muted hover:text-foreground hover:bg-surface-off'
                  }`}
                >
                  {isAnnotateMode ? <MessageSquarePlus className="w-4 h-4 animate-pulse" /> : <Navigation className="w-4 h-4" />}
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
