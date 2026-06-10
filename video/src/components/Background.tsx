import React from "react";
import { AbsoluteFill } from "remotion";
import { BRAND_BG, COLORS, FONT_FAMILY_SANS } from "../style";

/** Fondo de marca a pantalla completa, fuente sans por defecto. */
export const Background: React.FC<{ children?: React.ReactNode; padding?: number }> = ({
  children,
  padding = 90,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: BRAND_BG,
        color: COLORS.fg,
        fontFamily: FONT_FAMILY_SANS,
        padding,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
