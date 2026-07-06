'use client';

import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Plus, X } from 'lucide-react';
import type { SurfaceWrap } from '@/lib/viewer3d/surfaceProjection';

type Point3D = { x: number; y: number; z: number };

const EDIT_COLOR = '#f59e0b';
const MIN_NODES = 3;
const NODE_RADIUS = 0.45;
const NODE_HIT_RADIUS = 1.1;
// Máximo de handles interactivos visibles — con trazados densos (200+ pts) mostrar
// todos crea cientos de elementos HTML que congelan el frame. Subsamplear a max 40.
const MAX_HANDLES = 40;

/**
 * Editor de nodos de un trazado cerrado: nodos arrastrables, "+" en midpoints
 * para insertar y × para borrar. La curva completa es agarrable (hit-line ancha
 * invisible). La curva de display pasa por el pipeline de superficie
 * (surfaceWrap): abraza el mesh, respeta oclusión y muestra fantasma en la
 * porción tapada. Los handles quedan siempre visibles (depthTest off), como
 * los handles activos de exocad.
 */
export default function PolylineNodeEditor({
  points,
  surfaceWrap,
  isNodeDragging,
  onNodePointerDown,
  onCurvePointerDown,
  onHoverChange,
  onInsertNode,
  onDeleteNode,
}: {
  points: Point3D[];
  surfaceWrap: SurfaceWrap;
  isNodeDragging: boolean;
  onNodePointerDown: (index: number, e: ThreeEvent<PointerEvent>) => void;
  onCurvePointerDown?: (worldPoint: THREE.Vector3, e: ThreeEvent<PointerEvent>) => void;
  onHoverChange?: (hovering: boolean) => void;
  onInsertNode: (segmentIndex: number) => void;
  onDeleteNode: (index: number) => void;
}) {
  // Pipeline de display: calidad reducida durante el drag (menos muestras y una
  // sola iteración de proyección), completa al soltar.
  const displayPoints = useMemo(() => {
    if (points.length < 2) return null;
    const wrapped = points.length === 2
      ? points
      : surfaceWrap.wrap(points, isNodeDragging ? 'drag' : 'full');
    const vecs = wrapped.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return [...vecs, vecs[0]];
  }, [points, surfaceWrap, isNodeDragging]);

  // Handles interactivos: subsamplear si hay demasiados puntos.
  // Cada handle guarda el índice real en `points` para que el drag sea correcto.
  const handles = useMemo(() => {
    if (points.length === 0) return [];
    const stride = Math.max(1, Math.ceil(points.length / MAX_HANDLES));
    return points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i % stride === 0);
  }, [points]);

  // Midpoints entre handles adyacentes para el botón de insertar.
  const midpoints = useMemo(() => {
    if (handles.length < 2) return [];
    return handles.map(({ p, i }, hi) => {
      const next = handles[(hi + 1) % handles.length];
      return {
        x: (p.x + next.p.x) / 2,
        y: (p.y + next.p.y) / 2,
        z: (p.z + next.p.z) / 2,
        segIndex: i, // índice en points[] del primer punto del segmento
      };
    });
  }, [handles]);

  const canDelete = points.length > MIN_NODES;

  return (
    <group>
      {displayPoints && (
        <>
          {/* Pase principal: oclusión real (el offset por normal evita z-fighting) */}
          <Line points={displayPoints} color={EDIT_COLOR} lineWidth={2.5} />
          {/* Pase fantasma: porción tapada, atenuada */}
          <Line
            points={displayPoints}
            color={EDIT_COLOR}
            lineWidth={2.5}
            transparent
            opacity={0.15}
            depthFunc={THREE.GreaterDepth}
            depthWrite={false}
          />
          {/* Hit-line ancha invisible: zona generosa para agarrar la curva.
              depthWrite=false — si escribiera depth activaría el fantasma. */}
          <Line
            points={displayPoints}
            color={EDIT_COLOR}
            lineWidth={18}
            transparent
            opacity={0}
            depthWrite={false}
            onPointerOver={onHoverChange ? (e) => { e.stopPropagation(); onHoverChange(true); } : undefined}
            onPointerOut={onHoverChange ? () => onHoverChange(false) : undefined}
            onPointerDown={onCurvePointerDown ? (e) => onCurvePointerDown(e.point, e) : undefined}
          />
        </>
      )}

      {handles.map(({ p, i }) => (
        <group key={`node-${i}`} position={[p.x, p.y, p.z]}>
          <mesh renderOrder={999}>
            <sphereGeometry args={[NODE_RADIUS, 12, 12]} />
            <meshBasicMaterial color={EDIT_COLOR} depthTest={false} />
          </mesh>
          {/* Esfera de hit invisible más grande: agarrar el nodo sin puntería fina */}
          <mesh
            visible={false}
            onPointerDown={(e) => onNodePointerDown(i, e)}
            onPointerOver={onHoverChange ? (e) => { e.stopPropagation(); onHoverChange(true); } : undefined}
            onPointerOut={onHoverChange ? () => onHoverChange(false) : undefined}
          >
            <sphereGeometry args={[NODE_HIT_RADIUS, 8, 8]} />
            <meshBasicMaterial />
          </mesh>
          {!isNodeDragging && canDelete && (
            <Html zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteNode(i); }}
                aria-label="Eliminar nodo"
                title="Eliminar nodo"
                className="w-4 h-4 flex items-center justify-center bg-surface/90 border border-divider/60 hover:bg-error-hl rounded-full text-muted hover:text-error transition-colors shadow-sm"
                style={{ transform: 'translate(8px, -14px)' }}
              >
                <X className="w-2 h-2" />
              </button>
            </Html>
          )}
        </group>
      ))}

      {!isNodeDragging && midpoints.map((m, hi) => (
        <group key={`mid-${hi}`} position={[m.x, m.y, m.z]}>
          <Html zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onInsertNode(m.segIndex); }}
              aria-label="Insertar nodo"
              title="Insertar nodo"
              className="w-4 h-4 flex items-center justify-center bg-surface/80 border border-divider/50 hover:bg-primary-hl rounded-full text-muted hover:text-primary transition-colors shadow-sm opacity-60 hover:opacity-100"
              style={{ transform: 'translate(-50%, -50%)' }}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </Html>
        </group>
      ))}
    </group>
  );
}
