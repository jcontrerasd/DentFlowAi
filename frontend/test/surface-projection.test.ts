import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ensureBoundsTree,
  closestSurfacePoint,
  pickHomeMesh,
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
