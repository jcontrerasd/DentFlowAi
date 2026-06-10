import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY_SANS } from "../style";

/**
 * Subtítulo / kinetic text sincronizado a la VO. Fija el timing de cada beat
 * antes de que exista el audio y queda como subtítulo en el render final.
 */
export const Caption: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({
  children,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 8, durationInFrames - 8, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 70 }}>
      <div
        style={{
          opacity,
          maxWidth: 1300,
          textAlign: "center",
          fontFamily: FONT_FAMILY_SANS,
          fontSize: 30,
          lineHeight: 1.45,
          fontWeight: 500,
          color: COLORS.fg,
          background: "rgba(2,6,23,.66)",
          border: `1px solid ${COLORS.line}`,
          borderRadius: 16,
          padding: "16px 26px",
          backdropFilter: "blur(4px)",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
