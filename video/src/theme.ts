/**
 * Tokens de marca portados de Doc/Fauchard_Presentacion_Comercial.html.
 * Una sola fuente de verdad para todas las escenas/primitivos del video.
 */

export const COLORS = {
  bg: "#020617",
  bg2: "#0b1220",
  panel: "#0f172a",
  panel2: "#111c33",
  line: "rgba(148,163,184,.18)",
  line2: "rgba(148,163,184,.30)",
  fg: "#f8fafc",
  muted: "#94a3b8",
  muted2: "#cbd5e1",
  teal: "#2dd4bf",
  teal2: "#14b8a6",
  teal3: "#0d9488",
  tealsoft: "rgba(45,212,191,.12)",
  amber: "#fbbf24",
  verde: "#22c55e",
  amarillo: "#eab308",
  naranja: "#f97316",
  rojo: "#ef4444",
  rosa: "#f472b6",
} as const;

/** Niveles de complejidad → color + liga (espeja la tabla del HTML). */
export const NIVELES = {
  basico: { label: "Básico", color: COLORS.verde, liga: "Bronce" },
  intermedio: { label: "Intermedio", color: COLORS.amarillo, liga: "Plata" },
  avanzado: { label: "Avanzado", color: COLORS.naranja, liga: "Oro" },
  critico: { label: "Crítico", color: COLORS.rojo, liga: "Élite" },
} as const;

/** Colores por liga (chips). */
export const LIGA_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  Bronce: { fg: "#d8a06a", bg: "rgba(180,120,70,.18)", border: "rgba(180,120,70,.4)" },
  Plata: { fg: "#cbd5e1", bg: "rgba(180,190,205,.15)", border: "rgba(180,190,205,.35)" },
  Oro: { fg: "#fcd34d", bg: "rgba(234,179,8,.15)", border: "rgba(234,179,8,.4)" },
  Élite: { fg: "#c4b5fd", bg: "rgba(167,139,250,.15)", border: "rgba(167,139,250,.4)" },
};

export const FONT = {
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** Fondo radial de marca (igual al body del HTML). */
export const BRAND_BG =
  "radial-gradient(1200px 600px at 80% -10%, rgba(13,148,136,.18), transparent 60%)," +
  "radial-gradient(1000px 500px at -10% 20%, rgba(45,212,191,.08), transparent 55%)," +
  COLORS.bg;

/** Frames por segundo del proyecto. */
export const FPS = 30;
