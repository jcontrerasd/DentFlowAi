// Proyección de trazados a la superficie del mesh dental vía three-mesh-bvh.
// Depende de three (sin React) — testeable headless en vitest con geometría sintética.

import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, getTriangleHitPointInfo } from 'three-mesh-bvh';
import {
  chaikinSmoothClosed,
  resampleClosedByArc,
  smoothClosedVectors,
  CHAIKIN_ITERATIONS,
  DISPLAY_SPACING_MM,
  DISPLAY_MAX_SAMPLES,
  SURFACE_OFFSET_MM,
  type Point3D,
} from './polylineGeometry';

// Guarda generosa de proyección: cuerdas de trazados legacy escasos pueden estar
// lejos de la superficie; el shrink-wrap iterativo las converge.
const PROJECT_MAX_DIST_MM = 8;
// Umbral de mediana para elegir el mesh dueño de un trazado (los puntos crudos
// están SOBRE su superficie — mediana ≈ 0; la otra arcada queda a milímetros).
const HOME_MAX_MEDIAN_MM = 1.0;
const WRAP_ITERATIONS = 2;

let raycastInstalled = false;

/**
 * Parche global idempotente: Mesh.prototype.raycast = acceleratedRaycast.
 * Sin `geometry.boundsTree`, acceleratedRaycast cae al raycast original de three
 * (capturado antes del parche) — los demás Canvas de la app no cambian.
 */
export function installBVHRaycast(): void {
  if (raycastInstalled) return;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  raycastInstalled = true;
}

type GeometryWithBVH = THREE.BufferGeometry & { boundsTree?: MeshBVH };

/**
 * Construye (sync) y cachea el BVH en `geometry.boundsTree`. Idempotente.
 * Nota: MeshBVH agrega un índice secuencial si la geometría es non-indexed (STL) —
 * mutación inofensiva para el render y requisito de getTriangleHitPointInfo.
 */
export function ensureBoundsTree(geometry: THREE.BufferGeometry): MeshBVH {
  const g = geometry as GeometryWithBVH;
  if (!g.boundsTree) {
    g.boundsTree = new MeshBVH(geometry);
  }
  return g.boundsTree;
}

/**
 * Programa ensureBoundsTree fuera del frame actual (requestIdleCallback con
 * fallback a setTimeout). Devuelve cancel(). Llama onReady al terminar
 * (también si el BVH ya existía).
 */
export function scheduleBoundsTree(geometry: THREE.BufferGeometry, onReady: () => void): () => void {
  const g = geometry as GeometryWithBVH;
  if (g.boundsTree) {
    onReady();
    return () => {};
  }
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    ensureBoundsTree(geometry);
    onReady();
  };
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 2000 });
    return () => { cancelled = true; cancelIdleCallback(id); };
  }
  const id = setTimeout(run, 200);
  return () => { cancelled = true; clearTimeout(id); };
}

export interface SurfaceHit {
  point: Point3D;
  normal: Point3D;
  distance: number;
}

// Temps módulo-level: cero allocations por query durante drags.
const _tmpPoint = new THREE.Vector3();
const _tmpTarget = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const _tmpHitInfo = {
  point: new THREE.Vector3(),
  distance: 0,
  face: { a: 0, b: 0, c: 0, materialIndex: 0, normal: new THREE.Vector3() },
  uv: new THREE.Vector2(),
};

/**
 * Punto de superficie más cercano a `localPoint` (espacio local del mesh, que
 * para STL/PLY coincide con el espacio del grupo de escena y de los puntos
 * guardados). Devuelve null si el BVH no está construido o no hay hit dentro
 * de maxDistance.
 */
export function closestSurfacePoint(
  mesh: THREE.Mesh,
  localPoint: Point3D,
  maxDistance: number = PROJECT_MAX_DIST_MM,
): SurfaceHit | null {
  const geometry = mesh.geometry as GeometryWithBVH;
  const bvh = geometry.boundsTree;
  if (!bvh || !geometry.getIndex()) return null;
  _tmpPoint.set(localPoint.x, localPoint.y, localPoint.z);
  const hit = bvh.closestPointToPoint(_tmpPoint, _tmpTarget, 0, maxDistance);
  if (!hit) return null;
  getTriangleHitPointInfo(hit.point, geometry, hit.faceIndex, _tmpHitInfo);
  return {
    point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    normal: { x: _tmpHitInfo.face.normal.x, y: _tmpHitInfo.face.normal.y, z: _tmpHitInfo.face.normal.z },
    distance: hit.distance,
  };
}

/**
 * Elige el mesh "dueño" del trazado: menor distancia MEDIANA de una muestra de
 * puntos crudos a cada mesh con BVH listo. Los puntos fueron capturados sobre
 * su superficie (mediana ≈ 0); la otra arcada queda a milímetros — evita el
 * snap cruzado en zonas de contacto oclusal. Null si nadie baja de 1 mm.
 */
export function pickHomeMesh(points: Point3D[], meshes: THREE.Mesh[]): THREE.Mesh | null {
  if (points.length === 0 || meshes.length === 0) return null;
  const sampleCount = Math.min(12, points.length);
  const stride = Math.max(1, Math.floor(points.length / sampleCount));
  let best: THREE.Mesh | null = null;
  let bestMedian = Infinity;
  for (const mesh of meshes) {
    const dists: number[] = [];
    for (let i = 0; i < points.length; i += stride) {
      const hit = closestSurfacePoint(mesh, points[i], PROJECT_MAX_DIST_MM);
      dists.push(hit ? hit.distance : Infinity);
    }
    if (dists.length === 0) continue;
    dists.sort((a, b) => a - b);
    const median = dists[Math.floor(dists.length / 2)];
    if (median < bestMedian) {
      bestMedian = median;
      best = mesh;
    }
  }
  return bestMedian <= HOME_MAX_MEDIAN_MM ? best : null;
}

/**
 * Servicio memoizado que el visor pasa a los renders de trazados: `version`
 * invalida memos cuando cambian los meshes o termina un build de BVH; `wrap`
 * ejecuta el pipeline con calidad completa o reducida (durante drag de nodo).
 */
export interface SurfaceWrap {
  version: number;
  wrap: (points: Point3D[], quality: 'full' | 'drag') => Point3D[];
}

export interface WrapOptions {
  spacing?: number;
  maxSamples?: number;
  offsetMm?: number;
  iterations?: number;
}

/**
 * Pipeline de display para un lazo cerrado, estilo shrink-wrap:
 * 1. Chaikin (redondea polígonos angulosos).
 * 2. × iterations: resample por arco → proyectar cada muestra a la superficie
 *    (sin hit dentro de la guarda, la muestra conserva su posición).
 * 3. Offset final por normal suavizada (media móvil circular) — la línea flota
 *    `offsetMm` sobre la superficie: depthTest normal sin z-fighting.
 * Con `mesh = null` (BVH pendiente, mesh oculto o trazado huérfano): solo
 * chaikin + resample, sin proyección ni offset — fallback al comportamiento previo.
 */
export function wrapClosedPolylineToSurface(
  points: Point3D[],
  mesh: THREE.Mesh | null,
  opts: WrapOptions = {},
): Point3D[] {
  if (points.length < 3) return points.map(p => ({ ...p }));
  const {
    spacing = DISPLAY_SPACING_MM,
    maxSamples = DISPLAY_MAX_SAMPLES,
    offsetMm = SURFACE_OFFSET_MM,
    iterations = WRAP_ITERATIONS,
  } = opts;

  let current = chaikinSmoothClosed(points, CHAIKIN_ITERATIONS);

  if (!mesh) {
    return resampleClosedByArc(current, spacing, maxSamples);
  }

  let normals: Point3D[] = [];
  for (let it = 0; it < iterations; it++) {
    current = resampleClosedByArc(current, spacing, maxSamples);
    normals = new Array(current.length);
    for (let i = 0; i < current.length; i++) {
      const hit = closestSurfacePoint(mesh, current[i], PROJECT_MAX_DIST_MM);
      if (hit) {
        current[i] = hit.point;
        normals[i] = hit.normal;
      } else {
        normals[i] = { x: 0, y: 0, z: 0 };
      }
    }
  }

  const smoothed = smoothClosedVectors(normals, 3);
  return current.map((q, i) => ({
    x: q.x + smoothed[i].x * offsetMm,
    y: q.y + smoothed[i].y * offsetMm,
    z: q.z + smoothed[i].z * offsetMm,
  }));
}
