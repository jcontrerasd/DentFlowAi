import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ensureBoundsTree,
  closestSurfacePoint,
  pickHomeMesh,
  ridgePathBetween,
  snapToRidge,
  wrapClosedPolylineToSurface,
} from '@/lib/viewer3d/surfaceProjection';
import type { Point3D } from '@/lib/viewer3d/polylineGeometry';

const p = (x: number, y: number, z: number): Point3D => ({ x, y, z });

/** Plano 20×20 en XY (z=0), non-indexed — mismo caso que un STL real. */
function makePlaneMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(20, 20, 20, 20).toNonIndexed();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  ensureBoundsTree(geometry);
  return mesh;
}

function makeSphereMesh(radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 48, 32).toNonIndexed();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  ensureBoundsTree(geometry);
  return mesh;
}

describe('ensureBoundsTree', () => {
  it('construye el BVH y agrega índice a geometría non-indexed', () => {
    const geometry = new THREE.PlaneGeometry(10, 10).toNonIndexed();
    expect(geometry.getIndex()).toBeNull();
    const bvh = ensureBoundsTree(geometry);
    expect(bvh).toBeDefined();
    expect(geometry.getIndex()).not.toBeNull();
  });

  it('es idempotente: segunda llamada devuelve el mismo BVH', () => {
    const geometry = new THREE.PlaneGeometry(10, 10).toNonIndexed();
    expect(ensureBoundsTree(geometry)).toBe(ensureBoundsTree(geometry));
  });
});

describe('closestSurfacePoint', () => {
  it('proyecta un punto flotante al plano con normal (0,0,±1)', () => {
    const mesh = makePlaneMesh();
    const hit = closestSurfacePoint(mesh, p(3, 4, 2.5));
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(3);
    expect(hit!.point.y).toBeCloseTo(4);
    expect(hit!.point.z).toBeCloseTo(0);
    expect(hit!.distance).toBeCloseTo(2.5);
    expect(Math.abs(hit!.normal.z)).toBeCloseTo(1);
  });

  it('devuelve null fuera de maxDistance', () => {
    const mesh = makePlaneMesh();
    expect(closestSurfacePoint(mesh, p(0, 0, 50), 8)).toBeNull();
  });

  it('devuelve null sin BVH construido', () => {
    const geometry = new THREE.PlaneGeometry(10, 10).toNonIndexed();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    expect(closestSurfacePoint(mesh, p(0, 0, 0))).toBeNull();
  });
});

describe('pickHomeMesh', () => {
  it('elige el mesh cuya superficie contiene los puntos y descarta el lejano', () => {
    // Dos "arcadas": plano en z=0 y esfera centrada lejos
    const plane = makePlaneMesh();
    const sphere = makeSphereMesh(5);
    sphere.geometry.translate(0, 0, 30); // superficie a ~25mm del plano

    const tracedOnPlane = [p(1, 1, 0.01), p(5, 1, 0.02), p(5, 5, 0.01), p(1, 5, 0.0)];
    expect(pickHomeMesh(tracedOnPlane, [plane, sphere])).toBe(plane);
  });

  it('devuelve null si ningún mesh está a menos de 1mm de mediana', () => {
    const plane = makePlaneMesh();
    const floating = [p(0, 0, 5), p(1, 0, 5), p(1, 1, 5), p(0, 1, 5)];
    expect(pickHomeMesh(floating, [plane])).toBeNull();
  });

  it('devuelve null sin puntos o sin meshes', () => {
    const plane = makePlaneMesh();
    expect(pickHomeMesh([], [plane])).toBeNull();
    expect(pickHomeMesh([p(0, 0, 0)], [])).toBeNull();
  });
});

/**
 * Techo a dos aguas: caballete a lo largo del eje Y en x=0 con z=5; los planos
 * bajan a z=0 en x=±5. Malla non-indexed (sopa, como STL real).
 */
function makeGableRoofMesh(): THREE.Mesh {
  const positions: number[] = [];
  const steps = 10;
  const cell = 10 / steps;
  const zAt = (x: number) => 5 - Math.abs(x);
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x0 = -5 + i * cell;
      const x1 = x0 + cell;
      const y0 = -5 + j * cell;
      const y1 = y0 + cell;
      positions.push(
        x0, y0, zAt(x0), x1, y0, zAt(x1), x1, y1, zAt(x1),
        x0, y0, zAt(x0), x1, y1, zAt(x1), x0, y1, zAt(x0),
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  ensureBoundsTree(geometry);
  return mesh;
}

describe('snapToRidge', () => {
  it('atrae un punto cercano al caballete hacia el filo', () => {
    const mesh = makeGableRoofMesh();
    // Punto sobre la ladera derecha, a 1.2mm del caballete (x=0)
    const start = p(1.2, 0, 5 - 1.2);
    const out = snapToRidge(mesh, start, 2.5);
    expect(out).not.toBeNull();
    // Se acercó claramente al caballete y sigue sobre la superficie
    expect(Math.abs(out!.x)).toBeLessThan(0.7);
    expect(out!.z).toBeCloseTo(5 - Math.abs(out!.x), 1);
  });

  it('devuelve null sobre una superficie lisa (sin filo distinguible)', () => {
    const mesh = makePlaneMesh();
    expect(snapToRidge(mesh, p(2, 2, 0), 2)).toBeNull();
  });

  it('devuelve null lejos de cualquier filo (ladera plana del techo)', () => {
    const mesh = makeGableRoofMesh();
    // A 4mm del caballete con radio 1: el vecindario es un solo plano
    expect(snapToRidge(mesh, p(4, 0, 1), 1)).toBeNull();
  });

  it('devuelve null sin BVH construido', () => {
    const geometry = new THREE.PlaneGeometry(10, 10).toNonIndexed();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    expect(snapToRidge(mesh, p(0, 0, 0), 2)).toBeNull();
  });
});

describe('ridgePathBetween', () => {
  it('el camino entre dos puntos cercanos al caballete corre POR el caballete', () => {
    const mesh = makeGableRoofMesh();
    // Ambos puntos sobre la ladera derecha a 1mm del filo: la recta entre
    // ellos es un camino válido (misma ladera), pero el filo es más barato.
    const a = p(1, -4, 4);
    const b = p(1, 4, 4);
    const path = ridgePathBetween(mesh, a, b);
    expect(path.length).toBeGreaterThan(2);
    // Los puntos intermedios del camino están pegados al caballete (x ≈ 0)
    const middle = path.slice(2, -2);
    expect(middle.length).toBeGreaterThan(0);
    for (const q of middle) {
      expect(Math.abs(q.x)).toBeLessThan(0.6);
    }
    // Extremos exactos en las anclas
    expect(path[0]).toEqual(a);
    expect(path[path.length - 1]).toEqual(b);
  });

  it('sin BVH devuelve la recta [a, b]', () => {
    const geometry = new THREE.PlaneGeometry(10, 10).toNonIndexed();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const path = ridgePathBetween(mesh, p(0, 0, 0), p(5, 0, 0));
    expect(path).toEqual([p(0, 0, 0), p(5, 0, 0)]);
  });

  it('sobre un plano liso devuelve un camino casi recto', () => {
    const mesh = makePlaneMesh();
    const path = ridgePathBetween(mesh, p(-4, 0, 0), p(4, 0, 0));
    // Sin filo que seguir, el camino no se desvía significativamente
    for (const q of path) {
      expect(Math.abs(q.y)).toBeLessThan(1.5);
    }
  });
});

describe('wrapClosedPolylineToSurface', () => {
  it('devuelve las muestras sobre el plano + offset por normal', () => {
    const mesh = makePlaneMesh();
    // Cuadrado flotando 1mm sobre el plano
    const loop = [p(-4, -4, 1), p(4, -4, 1), p(4, 4, 1), p(-4, 4, 1)];
    const out = wrapClosedPolylineToSurface(loop, mesh, { offsetMm: 0.12 });
    expect(out.length).toBeGreaterThan(20);
    for (const q of out) {
      // z = superficie (0) + offset 0.12 (normal ±Z; el plano de three mira +Z)
      expect(Math.abs(q.z)).toBeCloseTo(0.12, 3);
      expect(Math.abs(q.x)).toBeLessThanOrEqual(4.01);
      expect(Math.abs(q.y)).toBeLessThanOrEqual(4.01);
    }
  });

  it('shrink-wrap converge cuerdas largas hacia una esfera', () => {
    const mesh = makeSphereMesh(10);
    // Cuadrado inscrito grosero en el ecuador (cuerdas de ~14mm cortan por dentro)
    const r = 10;
    const loop = [p(r, 0, 0), p(0, r, 0), p(-r, 0, 0), p(0, -r, 0)];
    const out = wrapClosedPolylineToSurface(loop, mesh, { offsetMm: 0 });
    // Todas las muestras terminan sobre la superficie (radio ≈ 10)
    for (const q of out) {
      const radius = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
      expect(radius).toBeGreaterThan(9.5);
      expect(radius).toBeLessThan(10.05);
    }
  });

  it('sin mesh: fallback a chaikin + resample, sin proyección', () => {
    const loop = [p(0, 0, 5), p(10, 0, 5), p(10, 10, 5), p(0, 10, 5)];
    const out = wrapClosedPolylineToSurface(loop, null);
    expect(out.length).toBeGreaterThan(4);
    for (const q of out) expect(q.z).toBeCloseTo(5);
  });

  it('lazos degenerados (<3 puntos) se devuelven tal cual', () => {
    const two = [p(0, 0, 0), p(1, 0, 0)];
    expect(wrapClosedPolylineToSurface(two, null)).toEqual(two);
  });
});
