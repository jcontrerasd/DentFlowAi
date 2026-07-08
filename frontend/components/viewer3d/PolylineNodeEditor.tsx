'use client';

import { useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Line2 } from 'three-stdlib';
import type { SurfaceWrap } from '@/lib/viewer3d/surfaceProjection';

type Point3D = { x: number; y: number; z: number };

const EDIT_COLOR = '#f59e0b';
const EDIT_COLOR_ACTIVE = '#fbbf24';
// La hit-line con handlers se raycastea en CADA pointermove; Line2 recorre
// todos sus segmentos. Subsamplear la geometría de hit mantiene el orbitar
// fluido — la tolerancia de 18px absorbe la desviación de la cuerda.
const MAX_HIT_SEGMENTS = 120;

/**
 * Interfaz imperativa del drag: durante el arrastre el padre muta directamente
 * la geometría de las líneas (setPositions) — cero setState, cero re-renders,
 * 60fps. El commit a React ocurre al soltar.
 */
export interface PolylineNodeEditorHandle {
  /** Swap único al iniciar el drag: reemplaza la geometría por el buffer denso. */
  beginDragDisplay: (display: Float32Array) => void;
  /** Por pointermove: re-sube posiciones deformadas. */
  updateDragDisplay: (display: Float32Array) => void;
}

/**
 * Editor de trazado cerrado estilo 3Shape: SOLO la línea — sin nodos, botones
 * ni marcadores. La línea se ilumina al pasar el cursor (afford de agarre);
 * al presionar, el padre deforma la vecindad con falloff constante en pantalla
 * (imperativo, ver Handle).
 */
const PolylineNodeEditor = forwardRef<PolylineNodeEditorHandle, {
  points: Point3D[];
  surfaceWrap: SurfaceWrap;
  isNodeDragging: boolean;
  onCurvePointerDown?: (worldPoint: THREE.Vector3, e: ThreeEvent<PointerEvent>) => void;
  onHoverChange?: (hovering: boolean) => void;
}>(function PolylineNodeEditor({
  points,
  surfaceWrap,
  isNodeDragging,
  onCurvePointerDown,
  onHoverChange,
}, ref) {
  const [hovering, setHovering] = useState(false);

  const lineRef = useRef<Line2 | null>(null);
  const ghostRef = useRef<Line2 | null>(null);

  useImperativeHandle(ref, () => ({
    beginDragDisplay: (display) => {
      lineRef.current?.geometry.setPositions(display);
      ghostRef.current?.geometry.setPositions(display);
    },
    updateDragDisplay: (display) => {
      lineRef.current?.geometry.setPositions(display);
      ghostRef.current?.geometry.setPositions(display);
    },
  }), []);

  // Pipeline de display completo (chaikin → resample → proyección + offset).
  // Durante el drag la prop `points` no cambia → React no reconstruye la
  // geometría y el setPositions imperativo del Handle es lo que se ve.
  const displayPoints = useMemo(() => {
    if (points.length < 2) return null;
    const wrapped = points.length === 2 ? points : surfaceWrap.wrap(points);
    const vecs = wrapped.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return [...vecs, vecs[0]];
  }, [points, surfaceWrap]);

  // Geometría barata para la hit-line (subsampleada): el raycast por
  // pointermove no debe recorrer 1500 segmentos.
  const hitPoints = useMemo(() => {
    if (!displayPoints) return null;
    const stride = Math.max(1, Math.ceil(displayPoints.length / MAX_HIT_SEGMENTS));
    if (stride === 1) return displayPoints;
    const sub = displayPoints.filter((_, i) => i % stride === 0);
    sub.push(displayPoints[0]);
    return sub;
  }, [displayPoints]);

  const active = hovering || isNodeDragging;

  return (
    <group>
      {displayPoints && (
        <>
          {/* Pase principal: oclusión real (el offset por normal evita z-fighting).
              Se ilumina al hover/drag — único afford de agarre, sin marcadores. */}
          <Line
            ref={lineRef}
            points={displayPoints}
            color={active ? EDIT_COLOR_ACTIVE : EDIT_COLOR}
            lineWidth={active ? 3 : 2.5}
          />
          {/* Pase fantasma: porción tapada, atenuada */}
          <Line
            ref={ghostRef}
            points={displayPoints}
            color={EDIT_COLOR}
            lineWidth={2.5}
            transparent
            opacity={0.15}
            depthFunc={THREE.GreaterDepth}
            depthWrite={false}
          />
        </>
      )}
      {hitPoints && (
        /* Hit-line ancha invisible: zona generosa para agarrar la curva.
           depthWrite=false — si escribiera depth activaría el fantasma. */
        <Line
          points={hitPoints}
          color={EDIT_COLOR}
          lineWidth={18}
          transparent
          opacity={0}
          depthWrite={false}
          onPointerOver={(e) => { e.stopPropagation(); setHovering(true); onHoverChange?.(true); }}
          onPointerOut={() => { setHovering(false); onHoverChange?.(false); }}
          onPointerDown={onCurvePointerDown ? (e) => onCurvePointerDown(e.point, e) : undefined}
        />
      )}
    </group>
  );
});

export default PolylineNodeEditor;
