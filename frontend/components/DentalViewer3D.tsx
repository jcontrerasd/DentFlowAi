'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useLoader, type ThreeEvent } from '@react-three/fiber';
import { STLLoader, PLYLoader, OBJLoader } from '@/lib/three-loaders';
import {
  OrbitControls,
  Stage,
  Center,
  Html
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
  RefreshCcw
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
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.1}
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
       if (!child.material || (child.material as THREE.MeshStandardMaterial).color?.getHex() !== new THREE.Color(color).getHex()) {
          child.material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.4,
            metalness: 0.1,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAnnotateMode, setIsAnnotateMode] = useState(false);
  const [mountKey, setMountKey] = useState(0);

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
          camera={{ position: [0, 0, 200], fov: 45 }}
          // Fix: "demand" en lugar de "always" — renderiza solo cuando hay interacción,
          // reduciendo el uso de GPU de 60fps constantes a 0fps cuando el modelo está quieto.
          frameloop="demand"
          style={{ background: '#020617' }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance'
          }}
        >
          <color attach="background" args={['#020617']} />
          
          <Suspense fallback={null}>
            <Stage
              environment="city"
              intensity={0.4}
              shadows={false}
              adjustCamera={1.2}
            >
              {/* `key` derivado de las URLs de los modelos: el centrado se recalcula
                  solo cuando cambian los modelos, NO al agregar/editar pins. Así
                  el modelo y los pins comparten el mismo frame estable. */}
              <Center top key={validModels.map(m => m.url).join('|')}>
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
            </Stage>
          </Suspense>

          <OrbitControls 
            makeDefault 
            enableDamping={true}
          />
        </Canvas>
      </ErrorBoundary>

      {/* Interface Overlays */}
      <div className="absolute top-6 right-6 flex flex-col gap-3 z-20">
         <div className="flex flex-col gap-1 p-2 bg-surface backdrop-blur-md rounded-2xl border border-divider shadow-xl">
           {models.map(m => (
             <div key={m.subType} className="flex flex-col gap-1 p-1">
               <button
                 onClick={() => onToggleLayer?.(m.subType)}
                 className={`flex items-center justify-between gap-4 px-3 py-2 rounded-xl transition-all ${
                   m.visible ? 'bg-primary-hl text-foreground' : 'hover:bg-surface-off text-faint'
                 }`}
               >
                 <span className="text-[10px] uppercase font-bold tracking-tight">{m.subType}</span>
                 {m.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-50" />}
               </button>
               {m.visible && (
                 <input 
                   type="range" min="0.1" max="1" step="0.05"
                   value={m.opacity ?? 1}
                   onChange={(e) => onOpacityChange?.(m.subType, parseFloat(e.target.value))}
                   className="w-full h-1 bg-surface-2 rounded-full appearance-none cursor-pointer"
                 />
               )}
             </div>
           ))}
         </div>

         {canAnnotate && (
           <button 
              onClick={() => setIsAnnotateMode(!isAnnotateMode)}
              className={`p-3 bg-surface backdrop-blur-md rounded-2xl border border-divider shadow-xl transition-all ${
                isAnnotateMode ? 'text-error bg-error-hl' : 'text-muted hover:text-foreground'
              }`}
            >
               {isAnnotateMode ? <MessageSquarePlus className="w-4 h-4 animate-pulse" /> : <Navigation className="w-4 h-4" />}
            </button>
         )}

          <button onClick={toggleFullscreen} className="p-3 bg-surface backdrop-blur-md rounded-2xl border border-divider shadow-xl text-muted hover:text-foreground">
             <Maximize2 className="w-4 h-4" />
          </button>
      </div>



      {children}
    </div>
  );
}
