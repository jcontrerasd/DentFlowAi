import React from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../style";

/**
 * Loop del visor 3D. Si existe public/viewer3d-loop.mp4 (captura real del
 * DentalViewer3D girando) se usa ese clip; mientras tanto, placeholder animado
 * (un molar SVG que rota) para no bloquear el render.
 *
 * Para usar el clip real: dejar el archivo en video/public/viewer3d-loop.mp4
 * y cambiar USE_REAL_CLIP a true.
 */
const USE_REAL_CLIP = false;

export const Viewer3DLoop: React.FC<{ size?: number }> = ({ size = 320 }) => {
  const frame = useCurrentFrame();
  const rot = (frame * 1.6) % 360;

  if (USE_REAL_CLIP) {
    // Lazy import evita romper el bundle si el archivo no existe aún.
    const { OffthreadVideo } = require("remotion");
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${COLORS.line2}`,
          background: "#06101f",
        }}
      >
        <OffthreadVideo src={staticFile("viewer3d-loop.mp4")} muted loop />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 18,
        border: `1px solid ${COLORS.line2}`,
        background: "radial-gradient(circle at 50% 40%, #0c2b29, #06101f)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ transform: `perspective(700px) rotateY(${rot}deg)` }}>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 100 100">
          <path
            d="M50 12c-14 0-22 8-22 22 0 10 4 16 6 28 2 10 4 16 8 16 4 0 5-8 8-8s4 8 8 8c4 0 6-6 8-16 2-12 6-18 6-28 0-14-8-22-22-22z"
            fill="#0e3f3a"
            stroke={COLORS.teal}
            strokeWidth={2}
          />
          <ellipse cx="42" cy="34" rx="7" ry="9" fill="rgba(45,212,191,.25)" />
        </svg>
      </div>
    </div>
  );
};
