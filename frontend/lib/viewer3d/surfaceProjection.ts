// Proyección de trazados a la superficie del mesh dental vía three-mesh-bvh.
// Depende de three (sin React) — testeable headless en vitest con geometría sintética.

import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, getTriangleHitPointInfo } from 'three-mesh-bvh';
import {
  chaikinSmoothClosed,
  dist3,
  resampleClosedByArc,
  shortestPathInGraph,
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

// ── Imán al margen (detección local de filo por desviación de normales) ─────
// Nota: los STL son sopa de vértices (sin adyacencia) — la curvatura por
// vértice daría 0 en todas partes. En su lugar, en tiempo de consulta se
// examinan los triángulos dentro del radio: el filo es donde la normal local
// se desvía más de la normal media del vecindario.

const _ridgeSphere = new THREE.Sphere();
const _ridgeCentroid = new THREE.Vector3();
const _ridgeNormal = new THREE.Vector3();
const _ridgeAB = new THREE.Vector3();
const _ridgeCB = new THREE.Vector3();
// Buffers de candidatos reutilizables (cap fijo — cero allocations por query).
const RIDGE_MAX_TRIS = 512;
const _ridgeData = new Float32Array(RIDGE_MAX_TRIS * 7); // cx,cy,cz,nx,ny,nz,área

/** Umbral mínimo de desviación (1 − cos θ): ~0.06 ≈ 20° respecto de la media. */
const RIDGE_MIN_DEVIATION = 0.06;

/**
 * Atrae `point` hacia el filo (ridge de máxima curvatura) dentro de `radiusMm`,
 * si existe uno distinguible. Devuelve el punto imantado re-pegado a la
 * superficie, o null si el vecindario es liso (el punto no debe alterarse).
 */
export function snapToRidge(
  mesh: THREE.Mesh,
  point: Point3D,
  radiusMm: number,
  strength: number = 0.65,
): Point3D | null {
  const geometry = mesh.geometry as GeometryWithBVH;
  const bvh = geometry.boundsTree;
  if (!bvh || radiusMm <= 0) return null;

  _ridgeSphere.center.set(point.x, point.y, point.z);
  _ridgeSphere.radius = radiusMm;
  let count = 0;

  bvh.shapecast({
    intersectsBounds: (box: THREE.Box3) => box.intersectsSphere(_ridgeSphere),
    intersectsTriangle: (tri: THREE.Triangle) => {
      if (count >= RIDGE_MAX_TRIS) return true; // cap: abortar traversal
      _ridgeCentroid.copy(tri.a).add(tri.b).add(tri.c).multiplyScalar(1 / 3);
      if (_ridgeCentroid.distanceTo(_ridgeSphere.center) > radiusMm) return false;
      // Normal ponderada por área: cross sin normalizar (|cross| = 2·área).
      _ridgeCB.subVectors(tri.c, tri.b);
      _ridgeAB.subVectors(tri.a, tri.b);
      _ridgeNormal.crossVectors(_ridgeCB, _ridgeAB);
      const area2 = _ridgeNormal.length();
      if (area2 < 1e-12) return false;
      const o = count * 7;
      _ridgeData[o] = _ridgeCentroid.x;
      _ridgeData[o + 1] = _ridgeCentroid.y;
      _ridgeData[o + 2] = _ridgeCentroid.z;
      _ridgeData[o + 3] = _ridgeNormal.x / area2;
      _ridgeData[o + 4] = _ridgeNormal.y / area2;
      _ridgeData[o + 5] = _ridgeNormal.z / area2;
      _ridgeData[o + 6] = area2;
      count++;
      return false;
    },
  });

  if (count < 4) return null;

  // Ridgeness por PARES: un triángulo pertenece al filo si tiene un vecino
  // cercano con normal muy distinta. (La desviación vs. la normal media NO
  // sirve: junto al filo ambos planos se desvían por igual y no localiza.)
  const neighRadius = radiusMm * 0.5;
  const neighR2 = neighRadius * neighRadius;
  let bestScore = 0;
  let bestIdx = -1;
  let bestPartner = -1;
  for (let i = 0; i < count; i++) {
    const oi = i * 7;
    let ridgeness = 0;
    let partner = -1;
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const oj = j * 7;
      const dx = _ridgeData[oj] - _ridgeData[oi];
      const dy = _ridgeData[oj + 1] - _ridgeData[oi + 1];
      const dz = _ridgeData[oj + 2] - _ridgeData[oi + 2];
      if (dx * dx + dy * dy + dz * dz > neighR2) continue;
      const dot = _ridgeData[oi + 3] * _ridgeData[oj + 3]
        + _ridgeData[oi + 4] * _ridgeData[oj + 4]
        + _ridgeData[oi + 5] * _ridgeData[oj + 5];
      const diff = 1 - dot;
      if (diff > ridgeness) { ridgeness = diff; partner = j; }
    }
    if (ridgeness < RIDGE_MIN_DEVIATION || partner < 0) continue;
    const px = _ridgeData[oi] - point.x;
    const py = _ridgeData[oi + 1] - point.y;
    const pz = _ridgeData[oi + 2] - point.z;
    const dist = Math.sqrt(px * px + py * py + pz * pz);
    const score = ridgeness * (1 - dist / radiusMm);
    if (score > bestScore) { bestScore = score; bestIdx = i; bestPartner = partner; }
  }
  if (bestIdx < 0 || bestPartner < 0) return null;

  // El filo pasa ENTRE el par ganador: el midpoint de sus centroides es mejor
  // estimador de la arista que cualquiera de los dos centroides.
  const oa = bestIdx * 7;
  const ob = bestPartner * 7;
  const ridgeX = (_ridgeData[oa] + _ridgeData[ob]) / 2;
  const ridgeY = (_ridgeData[oa + 1] + _ridgeData[ob + 1]) / 2;
  const ridgeZ = (_ridgeData[oa + 2] + _ridgeData[ob + 2]) / 2;
  const target = {
    x: point.x + (ridgeX - point.x) * strength,
    y: point.y + (ridgeY - point.y) * strength,
    z: point.z + (ridgeZ - point.z) * strength,
  };
  const hit = closestSurfacePoint(mesh, target, radiusMm * 2);
  return hit ? hit.point : target;
}

// ── Propuesta automática: camino sobre la malla siguiendo el filo ───────────

const _corridorSeg = new THREE.Line3();
const _corridorTmp = new THREE.Vector3();
/** Tope de triángulos del corredor — más allá, el A* deja de ser interactivo. */
const CORRIDOR_MAX_TRIS = 60000;

/**
 * Camino entre dos puntos de la superficie que privilegia correr por el FILO
 * (aristas con ángulo diedro alto — la línea de margen de una preparación).
 * Construye un grafo local con los triángulos de un corredor alrededor del
 * segmento a-b (soldando vértices por posición — los STL son sopa) y resuelve
 * A* con pesos baratos sobre aristas de filo. Fallback: [a, b] (recta que el
 * pipeline de render proyecta como cualquier cuerda).
 */
export function ridgePathBetween(mesh: THREE.Mesh, a: Point3D, b: Point3D): Point3D[] {
  const geometry = mesh.geometry as GeometryWithBVH;
  const bvh = geometry.boundsTree;
  const straight = [{ ...a }, { ...b }];
  if (!bvh) return straight;

  const span = dist3(a, b);
  if (span < 1e-6) return straight;
  const radius = Math.max(3, span * 0.35);
  _corridorSeg.start.set(a.x, a.y, a.z);
  _corridorSeg.end.set(b.x, b.y, b.z);

  // 1. Corredor: soldar vértices por posición cuantizada y registrar aristas
  //    con las normales de sus triángulos adyacentes (para el diedro).
  const nodeIds = new Map<string, number>();
  const nodePos: Point3D[] = [];
  const edgeInfo = new Map<string, { i: number; j: number; len: number; n1: THREE.Vector3; n2: THREE.Vector3 | null }>();
  let overflow = false;
  let triCount = 0;

  const keyOf = (v: THREE.Vector3) =>
    `${Math.round(v.x * 100)}_${Math.round(v.y * 100)}_${Math.round(v.z * 100)}`;
  const nodeOf = (v: THREE.Vector3): number => {
    const k = keyOf(v);
    let id = nodeIds.get(k);
    if (id === undefined) {
      id = nodePos.length;
      nodeIds.set(k, id);
      nodePos.push({ x: v.x, y: v.y, z: v.z });
    }
    return id;
  };

  bvh.shapecast({
    intersectsBounds: (box: THREE.Box3) => {
      if (overflow) return false;
      // Distancia caja↔segmento aproximada: punto del segmento más cercano al
      // centro de la caja, chequeado contra la caja expandida por el radio.
      box.getCenter(_corridorTmp);
      _corridorSeg.closestPointToPoint(_corridorTmp, true, _corridorTmp);
      return box.distanceToPoint(_corridorTmp) <= radius;
    },
    intersectsTriangle: (tri: THREE.Triangle) => {
      if (overflow) return true;
      _ridgeCentroid.copy(tri.a).add(tri.b).add(tri.c).multiplyScalar(1 / 3);
      _corridorSeg.closestPointToPoint(_ridgeCentroid, true, _corridorTmp);
      if (_ridgeCentroid.distanceTo(_corridorTmp) > radius) return false;
      if (++triCount > CORRIDOR_MAX_TRIS) { overflow = true; return true; }

      _ridgeCB.subVectors(tri.c, tri.b);
      _ridgeAB.subVectors(tri.a, tri.b);
      _ridgeNormal.crossVectors(_ridgeCB, _ridgeAB);
      if (_ridgeNormal.lengthSq() < 1e-16) return false;
      const normal = _ridgeNormal.clone().normalize();

      const ia = nodeOf(tri.a);
      const ib = nodeOf(tri.b);
      const ic = nodeOf(tri.c);
      const pairs: Array<[number, number, THREE.Vector3, THREE.Vector3]> = [
        [ia, ib, tri.a, tri.b],
        [ib, ic, tri.b, tri.c],
        [ic, ia, tri.c, tri.a],
      ];
      for (const [i, j, va, vb] of pairs) {
        if (i === j) continue;
        const ek = i < j ? `${i}_${j}` : `${j}_${i}`;
        const existing = edgeInfo.get(ek);
        if (existing) {
          if (!existing.n2) existing.n2 = normal;
        } else {
          edgeInfo.set(ek, { i, j, len: va.distanceTo(vb), n1: normal, n2: null });
        }
      }
      return false;
    },
  });

  if (overflow || nodePos.length < 2) return straight;

  // 2. Pesos: aristas de filo (diedro alto entre sus dos caras) son baratas.
  const edges: Array<[number, number, number]> = [];
  for (const e of edgeInfo.values()) {
    const dihedral = e.n2 ? 1 - e.n1.dot(e.n2) : 0; // borde de malla → 0 (caro: evita rims rotos)
    const flatness = 1 - Math.min(1, dihedral / 0.3); // ≥0.3 (~45°) = filo pleno
    edges.push([e.i, e.j, e.len * (0.05 + flatness * flatness)]);
  }

  // 3. Nodos de inicio/fin: los más cercanos a las anclas.
  let startNode = -1;
  let endNode = -1;
  let ds = Infinity;
  let de = Infinity;
  for (let i = 0; i < nodePos.length; i++) {
    const da = dist3(nodePos[i], a);
    const db = dist3(nodePos[i], b);
    if (da < ds) { ds = da; startNode = i; }
    if (db < de) { de = db; endNode = i; }
  }
  if (startNode < 0 || endNode < 0 || startNode === endNode) return straight;

  const path = shortestPathInGraph(
    nodePos.length,
    edges,
    startNode,
    endNode,
    (n) => dist3(nodePos[n], nodePos[endNode]) * 0.05, // cota inferior (costo mínimo por mm)
  );
  if (!path || path.length < 2) return straight;

  // 4. Anclas exactas en los extremos + camino de vértices entre medio.
  const out: Point3D[] = [{ ...a }];
  for (const n of path) out.push({ ...nodePos[n] });
  out.push({ ...b });
  return out;
}

/**
 * Servicio memoizado que el visor pasa a los renders de trazados: `version`
 * invalida memos cuando cambian los meshes o termina un build de BVH; `wrap`
 * ejecuta el pipeline completo. (Durante el drag de nodos NO se usa: el drag
 * es imperativo — muta la geometría de la línea sin pasar por React.)
 */
export interface SurfaceWrap {
  version: number;
  wrap: (points: Point3D[]) => Point3D[];
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
