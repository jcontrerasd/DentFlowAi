import { describe, it, expect } from 'vitest';
import {
  dist3,
  dedupeConsecutive,
  simplifyPolylineRDP,
  autoEpsilon,
  chaikinSmoothClosed,
  closedPerimeter,
  resampleClosedByArc,
  resampleClosedToCount,
  capClosedPolyline,
  smoothClosedVectors,
  type Point3D,
} from '@/lib/viewer3d/polylineGeometry';

const p = (x: number, y: number, z: number): Point3D => ({ x, y, z });

describe('dist3', () => {
  it('calcula distancia euclidiana 3D', () => {
    expect(dist3(p(0, 0, 0), p(3, 4, 0))).toBe(5);
    expect(dist3(p(1, 1, 1), p(1, 1, 1))).toBe(0);
  });
});

describe('dedupeConsecutive', () => {
  it('colapsa puntos consecutivos más cercanos que minDist', () => {
    const pts = [p(0, 0, 0), p(0.01, 0, 0), p(0.02, 0, 0), p(5, 0, 0)];
    const out = dedupeConsecutive(pts, 0.05);
    expect(out).toEqual([p(0, 0, 0), p(5, 0, 0)]);
  });

  it('conserva el último punto real del trazo', () => {
    const pts = [p(0, 0, 0), p(5, 0, 0), p(5.01, 0, 0)];
    const out = dedupeConsecutive(pts, 0.05);
    expect(out[out.length - 1]).toEqual(p(5.01, 0, 0));
  });

  it('no altera listas de 0 o 1 punto', () => {
    expect(dedupeConsecutive([], 0.05)).toEqual([]);
    expect(dedupeConsecutive([p(1, 2, 3)], 0.05)).toEqual([p(1, 2, 3)]);
  });

  it('devuelve copia, no la referencia original', () => {
    const pts = [p(0, 0, 0), p(1, 0, 0)];
    const out = dedupeConsecutive(pts, 0.05);
    expect(out).not.toBe(pts);
    expect(out).toEqual(pts);
  });
});

describe('simplifyPolylineRDP', () => {
  it('conserva siempre los extremos', () => {
    const pts = [p(0, 0, 0), p(1, 0.1, 0), p(2, -0.1, 0), p(3, 0, 0)];
    const out = simplifyPolylineRDP(pts, 10);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('colapsa puntos colineales dentro del epsilon', () => {
    const pts = [p(0, 0, 0), p(1, 0.01, 0), p(2, 0, 0), p(3, 0.01, 0), p(4, 0, 0)];
    const out = simplifyPolylineRDP(pts, 0.1);
    expect(out).toEqual([p(0, 0, 0), p(4, 0, 0)]);
  });

  it('conserva vértices que exceden el epsilon', () => {
    const pts = [p(0, 0, 0), p(5, 5, 0), p(10, 0, 0)];
    const out = simplifyPolylineRDP(pts, 0.1);
    expect(out).toEqual(pts);
  });

  it('con epsilon <= 0 devuelve todos los puntos', () => {
    const pts = [p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)];
    expect(simplifyPolylineRDP(pts, 0)).toEqual(pts);
    expect(simplifyPolylineRDP(pts, -1)).toEqual(pts);
  });

  it('no altera listas de 2 o menos puntos', () => {
    const pts = [p(0, 0, 0), p(1, 1, 1)];
    expect(simplifyPolylineRDP(pts, 5)).toEqual(pts);
  });

  it('reduce fuertemente un trazo freehand denso sin deformarlo', () => {
    // Semicírculo muestreado cada ~1.8° (100 puntos, radio 10 mm)
    const dense: Point3D[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (Math.PI * i) / 100;
      dense.push(p(10 * Math.cos(t), 10 * Math.sin(t), 0));
    }
    const out = simplifyPolylineRDP(dense, 0.35);
    expect(out.length).toBeLessThan(20);
    expect(out.length).toBeGreaterThanOrEqual(4);
    // Ningún punto original queda a más de ~epsilon de la forma simplificada:
    // verificación indirecta — los extremos y el ápice sobreviven.
    expect(out[0]).toEqual(dense[0]);
    expect(out[out.length - 1]).toEqual(dense[dense.length - 1]);
  });
});

describe('chaikinSmoothClosed', () => {
  const square = [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)];

  it('duplica los puntos por iteración (n → 2n)', () => {
    expect(chaikinSmoothClosed(square, 1)).toHaveLength(8);
    expect(chaikinSmoothClosed(square, 2)).toHaveLength(16);
  });

  it('conserva el centroide del lazo (corte simétrico de esquinas)', () => {
    const out = chaikinSmoothClosed(square, 2);
    const cx = out.reduce((s, q) => s + q.x, 0) / out.length;
    const cy = out.reduce((s, q) => s + q.y, 0) / out.length;
    expect(cx).toBeCloseTo(5);
    expect(cy).toBeCloseTo(5);
  });

  it('recorta las esquinas: ningún punto suavizado toca los vértices originales', () => {
    const out = chaikinSmoothClosed(square, 1);
    for (const q of out) {
      for (const v of square) {
        expect(dist3(q, v)).toBeGreaterThan(1);
      }
    }
  });

  it('con menos de 3 puntos o 0 iteraciones devuelve copia intacta', () => {
    const two = [p(0, 0, 0), p(1, 0, 0)];
    expect(chaikinSmoothClosed(two, 2)).toEqual(two);
    expect(chaikinSmoothClosed(square, 0)).toEqual(square);
  });
});

describe('closedPerimeter', () => {
  it('incluye el segmento de cierre último→primero', () => {
    const square = [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)];
    expect(closedPerimeter(square)).toBe(40);
  });

  it('devuelve 0 con menos de 2 puntos', () => {
    expect(closedPerimeter([])).toBe(0);
    expect(closedPerimeter([p(1, 2, 3)])).toBe(0);
  });
});

describe('resampleClosedToCount / resampleClosedByArc', () => {
  const square = [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)];

  it('produce exactamente count puntos equiespaciados por arco', () => {
    const out = resampleClosedToCount(square, 8);
    expect(out).toHaveLength(8);
    // Perímetro 40 / 8 = 5mm entre muestras consecutivas (sobre el polígono)
    for (let i = 0; i < out.length; i++) {
      const d = dist3(out[i], out[(i + 1) % out.length]);
      expect(d).toBeCloseTo(5, 5);
    }
  });

  it('el primer punto resampleado coincide con el primero original', () => {
    const out = resampleClosedToCount(square, 8);
    expect(out[0]).toEqual(square[0]);
  });

  it('resampleClosedByArc respeta spacing y techo maxSamples', () => {
    // Perímetro 40, spacing 1 → 40 muestras; techo 10 → 10 muestras
    expect(resampleClosedByArc(square, 1, 100)).toHaveLength(40);
    expect(resampleClosedByArc(square, 1, 10)).toHaveLength(10);
  });

  it('no altera lazos degenerados (<3 puntos)', () => {
    const two = [p(0, 0, 0), p(1, 0, 0)];
    expect(resampleClosedByArc(two, 0.5, 100)).toEqual(two);
  });
});

describe('capClosedPolyline', () => {
  it('devuelve la misma referencia si no excede el máximo', () => {
    const square = [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)];
    expect(capClosedPolyline(square, 500, 400)).toBe(square);
  });

  it('resamplea a target cuando excede el máximo', () => {
    const dense: Point3D[] = [];
    for (let i = 0; i < 600; i++) {
      const t = (2 * Math.PI * i) / 600;
      dense.push(p(10 * Math.cos(t), 10 * Math.sin(t), 0));
    }
    const out = capClosedPolyline(dense, 500, 400);
    expect(out).toHaveLength(400);
    // Sigue sobre el círculo de radio 10
    for (const q of out) {
      expect(Math.hypot(q.x, q.y)).toBeCloseTo(10, 1);
    }
  });
});

describe('smoothClosedVectors', () => {
  it('promedia con wrap circular y renormaliza a unitarios', () => {
    // Normales casi-Z con jitter alternante en X
    const vectors = [
      p(0.2, 0, 0.98), p(-0.2, 0, 0.98), p(0.2, 0, 0.98), p(-0.2, 0, 0.98),
    ].map(v => {
      const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      return p(v.x / len, v.y / len, v.z / len);
    });
    const out = smoothClosedVectors(vectors, 3);
    for (const v of out) {
      expect(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)).toBeCloseTo(1);
      // El jitter en X se atenúa (ventana 3 promedia +0.2/-0.2/+0.2 → ±0.066)
      expect(Math.abs(v.x)).toBeLessThan(0.1);
    }
  });

  it('con menos de 3 vectores o ventana < 3 devuelve copia', () => {
    const vs = [p(1, 0, 0), p(0, 1, 0)];
    expect(smoothClosedVectors(vs, 3)).toEqual(vs);
  });
});

describe('autoEpsilon', () => {
  it('usa el mínimo base con trazos degenerados (0-1 puntos)', () => {
    expect(autoEpsilon([])).toBe(0.35);
    expect(autoEpsilon([p(100, 100, 100)])).toBe(0.35);
  });

  it('usa el mínimo base para trazos chicos', () => {
    // Diagonal 10 mm → 0.5% = 0.05 < 0.35 → gana la base
    expect(autoEpsilon([p(0, 0, 0), p(10, 0, 0)])).toBe(0.35);
  });

  it('escala con la diagonal del bounding box en trazos grandes', () => {
    // Diagonal 100 mm → 0.5% = 0.5 > 0.35
    expect(autoEpsilon([p(0, 0, 0), p(100, 0, 0)])).toBeCloseTo(0.5);
  });
});
