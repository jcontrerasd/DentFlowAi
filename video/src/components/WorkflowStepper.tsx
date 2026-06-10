import React from "react";
import { COLORS, FONT_FAMILY_SANS } from "../style";

/**
 * Stepper del caso (espeja CaseWorkflowStepper). Variante integral por defecto:
 * incluye los pasos de fabricación.
 */
export const INTEGRAL_STEPS = [
  "Publicado",
  "Cotizado",
  "Aceptado",
  "En diseño",
  "En revisión",
  "Aprobado",
  "Fabricación",
  "Enviado",
  "Completado",
] as const;

export const WorkflowStepper: React.FC<{
  steps?: readonly string[];
  current: number; // índice del paso actual (0-based)
  scale?: number;
}> = ({ steps = INTEGRAL_STEPS, current, scale = 1 }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        fontFamily: FONT_FAMILY_SANS,
        rowGap: 12 * scale,
      }}
    >
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        const circle: React.CSSProperties = {
          width: 30 * scale,
          height: 30 * scale,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14 * scale,
          fontWeight: 800,
          border: `2px solid ${COLORS.line2}`,
          color: COLORS.muted,
        };
        if (done) Object.assign(circle, { background: COLORS.teal3, borderColor: COLORS.teal3, color: "#042f2e" });
        if (now)
          Object.assign(circle, {
            background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
            borderColor: COLORS.teal,
            color: "#042f2e",
            boxShadow: "0 0 0 5px rgba(45,212,191,.18)",
          });
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 * scale }}>
              <div style={circle}>{done ? "✓" : now ? "●" : i + 1}</div>
              <span
                style={{
                  fontSize: 14 * scale,
                  fontWeight: now ? 800 : 600,
                  color: now ? COLORS.fg : done ? COLORS.muted2 : COLORS.muted,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                style={{
                  width: 36 * scale,
                  height: 2,
                  margin: `0 ${8 * scale}px`,
                  background: done ? COLORS.teal3 : COLORS.line2,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
