// Funciones puras de geometría para el trazado de zonas del visor 3D.
// Sin dependencia de three — testeable en vitest sin canvas.

export type Point3D = { x: number; y: number; z: number };

export function dist3(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Elimina puntos consecutivos a menos de minDist (ruido de muestreo freehand). */
export function dedupeConsecutive(points: Point3D[], minDist: number): Point3D[] {
  if (points.length <= 1) return [...points];
  const out: Point3D[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist3(points[i], out[out.length - 1]) >= minDist) out.push(points[i]);
  }
  // Conservar siempre el último punto real del trazo (cierra la forma dibujada).
  if (out.length > 1 && out[out.length - 1] !== points[points.length - 1]) {
    if (dist3(points[points.length - 1], out[out.length - 1]) > 0) {
      out[out.length - 1] = points[points.length - 1];
    }
  } else if (out.length === 1 && points.length > 1 && dist3(points[points.length - 1], out[0]) > 0) {
    out.push(points[points.length - 1]);
  }
  return out;
}

/** Distancia perpendicular de p al segmento a-b (si el segmento degenera, distancia a `a`). */
export function distToSegment(p: Point3D, a: Point3D, b: Point3D): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const abLen2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  if (abLen2 === 0) return dist3(p, a);
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / abLen2));
  const proj = { x: a.x + t * ab.x, y: a.y + t * ab.y, z: a.z + t * ab.z };
  return dist3(p, proj);
}

/**
 * Ramer-Douglas-Peucker en 3D. Conserva extremos; con epsilon <= 0 devuelve copia intacta.
 * Iterativo (stack) para evitar recursión profunda con trazos freehand largos.
 */
export function simplifyPolylineRDP(points: Point3D[], epsilon: number): Point3D[] {
  if (points.length <= 2 || epsilon <= 0) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distToSegment(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx !== -1 && maxDist > epsilon) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ── Pipeline de display sobre superficie ─────────────────────────────────────
// Constantes compartidas entre el render (surfaceProjection) y la persistencia.
export const CHAIKIN_ITERATIONS = 2;
export const DISPLAY_SPACING_MM = 0.3;
export const DISPLAY_MAX_SAMPLES = 1500;
export const SURFACE_OFFSET_MM = 0.12;
export const PERSIST_MAX_POINTS = 500;   // límite duro del servidor (MAX_POLYLINE_POINTS)
export const PERSIST_RESAMPLE_TARGET = 400;

/**
 * Suavizado corner-cutting de Chaikin para un lazo CERRADO (wrap-around).
 * Cada iteración reemplaza cada punto por dos a 1/4 y 3/4 de cada segmento —
 * n puntos → 2n. Redondea polígonos angulosos (clics discretos, trazados legacy).
 */
export function chaikinSmoothClosed(points: Point3D[], iterations: number): Point3D[] {
  if (points.length < 3 || iterations <= 0) return points.map(p => ({ ...p }));
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point3D[] = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, z: a.z * 0.75 + b.z * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, z: a.z * 0.25 + b.z * 0.75 },
      );
    }
    current = next;
  }
  return current;
}

/** Longitud total del lazo cerrado (incluye el segmento último→primero). */
export function closedPerimeter(points: Point3D[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    total += dist3(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

/**
 * Resamplea el lazo cerrado a exactamente `count` puntos equiespaciados por
 * longitud de arco. Devuelve el lazo SIN duplicar el punto inicial.
 */
export function resampleClosedToCount(points: Point3D[], count: number): Point3D[] {
  if (points.length < 3 || count < 3) return points.map(p => ({ ...p }));
  const perimeter = closedPerimeter(points);
  if (perimeter <= 0) return points.map(p => ({ ...p }));
  const step = perimeter / count;
  const out: Point3D[] = [];
  let segIdx = 0;
  let segStart = points[0];
  let segEnd = points[1 % points.length];
  let segLen = dist3(segStart, segEnd);
  let traveled = 0; // distancia recorrida hasta el inicio del segmento actual
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (traveled + segLen < target && segIdx < points.length - 1) {
      traveled += segLen;
      segIdx++;
      segStart = points[segIdx];
      segEnd = points[(segIdx + 1) % points.length];
      segLen = dist3(segStart, segEnd);
    }
    const t = segLen > 0 ? (target - traveled) / segLen : 0;
    out.push({
      x: segStart.x + (segEnd.x - segStart.x) * t,
      y: segStart.y + (segEnd.y - segStart.y) * t,
      z: segStart.z + (segEnd.z - segStart.z) * t,
    });
  }
  return out;
}

/**
 * Resampleo uniforme por longitud de arco a `spacing` mm, con techo `maxSamples`.
 * Devuelve el lazo SIN duplicar el punto inicial.
 */
export function resampleClosedByArc(points: Point3D[], spacing: number, maxSamples: number): Point3D[] {
  if (points.length < 3 || spacing <= 0) return points.map(p => ({ ...p }));
  const perimeter = closedPerimeter(points);
  const count = Math.min(maxSamples, Math.max(3, Math.round(perimeter / spacing)));
  return resampleClosedToCount(points, count);
}

/** Si el lazo excede `max` puntos, lo resamplea a `target`; si no, lo devuelve tal cual. */
export function capClosedPolyline(points: Point3D[], max: number, target: number): Point3D[] {
  if (points.length <= max) return points;
  return resampleClosedToCount(points, target);
}

/**
 * Media móvil circular de vectores con renormalización (ventana impar, ej. 3).
 * Suaviza normales por-cara de STL antes del offset — elimina jitter por facetado.
 */
export function smoothClosedVectors(vectors: Point3D[], window: number): Point3D[] {
  if (vectors.length < 3 || window < 3) return vectors.map(v => ({ ...v }));
  const half = Math.floor(window / 2);
  const n = vectors.length;
  return vectors.map((_, i) => {
    let x = 0, y = 0, z = 0;
    for (let k = -half; k <= half; k++) {
      const v = vectors[(i + k + n) % n];
      x += v.x; y += v.y; z += v.z;
    }
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-9) return { ...vectors[i] };
    return { x: x / len, y: y / len, z: z / len };
  });
}

/**
 * Epsilon para RDP: max(0.35 unidades, 0.5% de la diagonal del bounding box del trazo).
 * Los STL dentales están en mm — 0.35 mm es clínicamente imperceptible.
 */
export function autoEpsilon(points: Point3D[]): number {
  const BASE = 0.35;
  if (points.length < 2) return BASE;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  const diagonal = dist3({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
  return Math.max(BASE, diagonal * 0.005);
}
