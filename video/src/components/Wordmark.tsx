import React from "react";
import { Img, staticFile } from "remotion";
import { COLORS, FONT_FAMILY_SANS } from "../style";

/** Logotipo DentFlowAi (espeja el .brand del nav del HTML). */
export const Wordmark: React.FC<{ size?: number; showTagline?: boolean }> = ({
  size = 40,
  showTagline = true,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
      <Img
        src={staticFile("dentflowai.jpg")}
        style={{ width: size, height: size, borderRadius: size * 0.26, objectFit: "cover" }}
      />
      <div
        style={{
          fontFamily: FONT_FAMILY_SANS,
          fontWeight: 800,
          letterSpacing: 0.5,
          fontSize: size * 0.7,
          color: COLORS.fg,
        }}
      >
        DentFlow<span style={{ color: COLORS.teal }}>Ai</span>
      </div>
      {showTagline && (
        <div
          style={{
            fontFamily: FONT_FAMILY_SANS,
            color: COLORS.muted,
            fontWeight: 600,
            fontSize: size * 0.3,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          · Motor Fauchard
        </div>
      )}
    </div>
  );
};
