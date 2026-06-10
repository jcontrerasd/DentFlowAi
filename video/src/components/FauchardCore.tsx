import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY_SANS, FONT_FAMILY_SERIF } from "../style";

/**
 * Caja negra Fauchard: las 4 decisiones aparecen en cascada, atadas a sus
 * parámetros reales (espeja la sección "El motor" + "Parámetros" del HTML).
 */
const DECISIONS = [
  {
    n: 1,
    title: "Clasifica el nivel",
    body: "Avanzado → Liga Oro",
    params: "Niveles · Ligas",
  },
  {
    n: 2,
    title: "Filtra a los técnicos",
    body: "Disponibilidad · habilidad mínima · cooldown · inactividad",
    params: "N°11 · N°12",
  },
  {
    n: 3,
    title: "Puntúa y sortea",
    body: "Calidad · Puntualidad · Experiencia · −Carga · +Bono · −No-respuesta",
    params: "N°1–N°6 · suman 1.000",
  },
  {
    n: 4,
    title: "Invita y arranca relojes",
    body: "5 técnicos anónimos · reloj de cotización y de propuesta",
    params: "N°13 · N°15 · N°16",
  },
];

export const FauchardCore: React.FC<{ revealStartFrame?: number; perStep?: number }> = ({
  revealStartFrame = 10,
  perStep = 22,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        background: "linear-gradient(160deg,rgba(13,148,136,.22),rgba(15,23,42,.5))",
        border: "1px solid rgba(45,212,191,.35)",
        borderRadius: 20,
        padding: 34,
        width: 760,
        boxShadow: "0 0 80px rgba(13,148,136,.18) inset",
        fontFamily: FONT_FAMILY_SANS,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontFamily: FONT_FAMILY_SERIF, fontSize: 44, color: COLORS.fg }}>FAUCHARD</div>
        <div
          style={{
            color: COLORS.teal,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          Motor de clasificación y asignación
        </div>
      </div>
      {DECISIONS.map((d, i) => {
        const start = revealStartFrame + i * perStep;
        const s = spring({ frame: frame - start, fps, config: { damping: 200 } });
        const y = interpolate(s, [0, 1], [24, 0]);
        return (
          <div
            key={d.n}
            style={{
              opacity: s,
              transform: `translateY(${y}px)`,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              background: "rgba(2,6,23,.4)",
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 11,
            }}
          >
            <div
              style={{
                flex: "none",
                width: 30,
                height: 30,
                borderRadius: 9,
                background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
                color: "#042f2e",
                fontWeight: 800,
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {d.n}
            </div>
            <div>
              <div style={{ color: COLORS.fg, fontWeight: 800, fontSize: 20 }}>{d.title}</div>
              <div style={{ color: COLORS.muted2, fontSize: 16, marginTop: 2 }}>{d.body}</div>
              <div style={{ color: COLORS.teal, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                {d.params}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
