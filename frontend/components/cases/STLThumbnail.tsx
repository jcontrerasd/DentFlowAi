'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import Image from 'next/image';
import { STLLoader, PLYLoader, OBJLoader } from '@/lib/three-loaders';
import { Center, Stage } from '@react-three/drei';
import * as THREE from 'three';

function getModelExtension(url: string): 'stl' | 'ply' | 'obj' {
  try {
    const parsed = new URL(url, 'http://localhost');
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.ply')) return 'ply';
    if (pathname.endsWith('.obj')) return 'obj';
    return 'stl';
  } catch {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.ply')) return 'ply';
    if (clean.endsWith('.obj')) return 'obj';
    return 'stl';
  }
}

/**
 * Componente interno que maneja el renderizado y la captura
 */
function SnapshotRenderer({ 
  url, 
  onCapture 
}: { 
  url: string, 
  onCapture: (dataUrl: string) => void 
}) {
  const { gl, scene, camera } = useThree();
  
  // Determinar el cargador según la extensión
  const extension = getModelExtension(url);
  const loader: typeof STLLoader | typeof PLYLoader | typeof OBJLoader =
    extension === 'ply' ? PLYLoader : extension === 'obj' ? OBJLoader : STLLoader;

  const result = useLoader(loader, url);
  const hasCaptured = useRef(false);

  useEffect(() => {
    // Esperar un momento a que el Stage y las luces se estabilicen
    const timer = setTimeout(() => {
      if (!hasCaptured.current && gl && gl.domElement) {
        try {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL('image/webp', 0.8);
          onCapture(dataUrl);
          hasCaptured.current = true;
        } catch (err) {
          console.error("[SnapshotRenderer] Capture failed:", err);
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [gl, scene, camera, onCapture]);

  // Si es geometría plana (STL/PLY)
  if (result instanceof THREE.BufferGeometry) {
    return (
      <Stage environment="city" intensity={0.5} shadows={false} adjustCamera={1.2}>
        <Center>
          <mesh geometry={result}>
            <meshStandardMaterial 
              color="#cbd5e1" 
              roughness={0.3} 
              metalness={0.2} 
            />
          </mesh>
        </Center>
      </Stage>
    );
  }

  // Si es un objeto/grupo (OBJ)
  return (
    <Stage environment="city" intensity={0.5} shadows={false} adjustCamera={1.2}>
      <Center>
        <primitive object={result}>
          {result.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: "#cbd5e1",
                roughness: 0.3,
                metalness: 0.2,
              });
            }
          })}
        </primitive>
      </Center>
    </Stage>
  );
}

/**
 * El componente principal huye del límite de contextos WebGL 
 * renderizando uno por uno y convirtiéndolos en imágenes estáticas.
 */
export default function STLThumbnail({ 
  url, 
  onGenerated 
}: { 
  url: string, 
  onGenerated?: (dataUrl: string) => void 
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  // Manejar la captura con un pequeño retraso para evitar que R3F intente 
  // conectar eventos a un DOM que ya no existe
  const handleCapture = (capturedUrl: string) => {
    if (!capturedUrl) return;
    setDataUrl(capturedUrl);
    
    // El retraso permite que el ciclo de renderizado de React termine 
    // antes de destruir el contexto WebGL
    setTimeout(() => {
      setIsRendering(false);
    }, 50);
    
    if (onGenerated) onGenerated(capturedUrl);
  };

  if (!url) return null;

  // Si ya tenemos la imagen, mostrarla directamente (limpio de WebGL)
  if (dataUrl) {
    return (
      <Image
        src={dataUrl} 
        alt="Preview 3D" 
        width={100}
        height={100}
        unoptimized
        className="h-full w-full object-contain object-center" 
      />
    );
  }

  // Si no, renderizamos el contexto temporalmente
  return (
    <div className="w-full h-full relative">
      {isRendering && (
        <Canvas
          onCreated={({ gl }) => {
            // Evita el “parpadeo negro” del buffer WebGL por defecto al capturar miniatura
            gl.setClearColor('#0f172a', 1);
          }}
          gl={{
            preserveDrawingBuffer: true, // Vital para toDataURL
            antialias: true,
            alpha: false,
          }}
          camera={{ position: [0, 0, 100], fov: 45 }}
          style={{ width: '100px', height: '100px', position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          frameloop="demand"
        >
          <color attach="background" args={['#0f172a']} />
          <Suspense fallback={null}>
            <SnapshotRenderer url={url} onCapture={handleCapture} />
          </Suspense>
        </Canvas>
      )}

      {/* Placeholder mientras carga/renderiza (mismo tono que la tarjeta, no negro puro) */}
      <div className="w-full h-full bg-surface-2/40 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
      </div>
    </div>
  );
}
