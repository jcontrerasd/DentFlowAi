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
  closedArcDistancesFrom,
  falloffWeight,
  falloffRadiusForLoop,
  spliceClosedPolyline,
  shortestPathInGraph,
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

describe('closedArcDistancesFrom', () => {
  // Cuadrado 10×10: perímetro 40, 8 puntos cada 5mm de arco
  const octagon: Point3D[] = [
    p(0, 0, 0), p(5, 0, 0), p(10, 0, 0), p(10, 5, 0),
    p(10, 10, 0), p(5, 10, 0), p(0, 10, 0), p(0, 5, 0),
  ];

  it('usa el camino más corto del lazo (wrap-around)', () => {
    const d = closedArcDistancesFrom(octagon, 0);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(5);   // adelante
    expect(d[7]).toBe(5);   // atrás (wrap)
    expect(d[2]).toBe(10);
    expect(d[6]).toBe(10);
    expect(d[4]).toBe(20);  // punto opuesto = perímetro/2
  });

  it('es simétrico respecto del índice de origen', () => {
    const d3 = closedArcDistancesFrom(octagon, 3);
    expect(d3[3]).toBe(0);
    expect(d3[2]).toBe(5);
    expect(d3[4]).toBe(5);
    expect(d3[7]).toBe(20);
  });

  it('degenerados: 0-1 puntos → distancias 0', () => {
    expect(closedArcDistancesFrom([], 0)).toEqual([]);
    expect(closedArcDistancesFrom([p(1, 1, 1)], 0)).toEqual([0]);
  });
});

describe('falloffWeight', () => {
  it('vale 1 en el origen y 0 fuera del radio', () => {
    expect(falloffWeight(0, 3)).toBe(1);
    expect(falloffWeight(3, 3)).toBe(0);
    expect(falloffWeight(5, 3)).toBe(0);
  });

  it('decrece monotónicamente con perfil afilado (cos⁴)', () => {
    const w1 = falloffWeight(0.5, 3);
    const w2 = falloffWeight(1.5, 3);
    const w3 = falloffWeight(2.5, 3);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
    expect(falloffWeight(1.5, 3)).toBeCloseTo(0.25); // cos⁴(π/4) = 0.25
  });

  it('radio inválido → 0', () => {
    expect(falloffWeight(1, 0)).toBe(0);
    expect(falloffWeight(1, -2)).toBe(0);
  });
});

describe('shortestPathInGraph', () => {
  it('prefiere el camino indirecto barato sobre la arista directa cara', () => {
    // 0→3 directo pesa 10; 0→1→2→3 pesa 3
    const edges: Array<[number, number, number]> = [
      [0, 3, 10], [0, 1, 1], [1, 2, 1], [2, 3, 1],
    ];
    expect(shortestPathInGraph(4, edges, 0, 3)).toEqual([0, 1, 2, 3]);
  });

  it('funciona igual con heurística admisible (A*)', () => {
    const edges: Array<[number, number, number]> = [
      [0, 3, 10], [0, 1, 1], [1, 2, 1], [2, 3, 1],
    ];
    const h = (n: number) => (3 - n) * 0.5; // cota inferior
    expect(shortestPathInGraph(4, edges, 0, 3, h)).toEqual([0, 1, 2, 3]);
  });

  it('devuelve null sin camino y [start] si start === end', () => {
    const edges: Array<[number, number, number]> = [[0, 1, 1]];
    expect(shortestPathInGraph(3, edges, 0, 2)).toBeNull();
    expect(shortestPathInGraph(3, edges, 1, 1)).toEqual([1]);
  });

  it('valida índices fuera de rango', () => {
    expect(shortestPathInGraph(2, [[0, 1, 1]], 0, 5)).toBeNull();
    expect(shortestPathInGraph(2, [[0, 1, 1]], -1, 1)).toBeNull();
  });
});

describe('spliceClosedPolyline', () => {
  // Cuadrado 10×10 denso (40 puntos, uno cada 1mm de arco) partiendo de (0,0)
  const denseSquare = resampleClosedToCount(
    [p(0, 0, 0), p(10, 0, 0), p(10, 10, 0), p(0, 10, 0)],
    40,
  );
  // Stroke que "recorta" la esquina (10,10): va de (10,2) a (2,10) en diagonal
  const cornerCut = [p(10, 2, 0), p(8, 4, 0), p(6, 6, 0), p(4, 8, 0), p(2, 10, 0)];

  it('reemplaza el arco más cercano al stroke (la esquina recortada desaparece)', () => {
    const out = spliceClosedPolyline(denseSquare, cornerCut, 2.5);
    expect(out).not.toBeNull();
    // La esquina (10,10) ya no existe; la esquina opuesta (0,0) sobrevive
    const hasCorner = out!.some(q => dist3(q, p(10, 10, 0)) < 0.5);
    const hasOrigin = out!.some(q => dist3(q, p(0, 0, 0)) < 0.5);
    expect(hasCorner).toBe(false);
    expect(hasOrigin).toBe(true);
    // Los puntos del stroke están en el resultado
    expect(out!.some(q => dist3(q, p(6, 6, 0)) < 0.01)).toBe(true);
  });

  it('con el stroke invertido produce el mismo lazo (misma región reemplazada)', () => {
    const out = spliceClosedPolyline(denseSquare, [...cornerCut].reverse(), 2.5);
    expect(out).not.toBeNull();
    expect(out!.some(q => dist3(q, p(10, 10, 0)) < 0.5)).toBe(false);
    expect(out!.some(q => dist3(q, p(0, 0, 0)) < 0.5)).toBe(true);
  });

  it('rechaza strokes cuyos extremos no tocan el lazo', () => {
    const farStroke = [p(20, 20, 0), p(25, 25, 0)];
    expect(spliceClosedPolyline(denseSquare, farStroke, 2.5)).toBeNull();
  });

  it('rechaza strokes degenerados (ambos extremos en el mismo punto del lazo)', () => {
    const tiny = [p(10, 2, 0), p(10.1, 2, 0)];
    expect(spliceClosedPolyline(denseSquare, tiny, 2.5)).toBeNull();
  });
});

describe('falloffRadiusForLoop', () => {
  it('clampea entre 2 y 6 mm', () => {
    expect(falloffRadiusForLoop(10)).toBe(2);     // 0.8 → clamp inferior
    expect(falloffRadiusForLoop(50)).toBe(4);     // 8% de 50
    expect(falloffRadiusForLoop(200)).toBe(6);    // 16 → clamp superior
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
