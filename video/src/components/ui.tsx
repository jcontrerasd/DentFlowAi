import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY_SANS, FONT_FAMILY_SERIF } from "../style";

/** Eyebrow con chip (espeja .eyebrow del HTML). */
export const Eyebrow: React.FC<{ chip?: string; children: React.ReactNode }> = ({
  chip = "FAUCHARD",
  children,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: COLORS.teal,
      fontFamily: FONT_FAMILY_SANS,
      marginBottom: 16,
    }}
  >
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        background: COLORS.tealsoft,
        border: "1px solid rgba(45,212,191,.3)",
        fontWeight: 800,
        letterSpacing: 1.5,
      }}
    >
      {chip}
    </span>
    {children}
  </div>
);

/** Título grande serif. */
export const Title: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  children,
  size = 64,
  style,
}) => (
  <h1
    style={{
      fontFamily: FONT_FAMILY_SERIF,
      fontWeight: 400,
      fontSize: size,
      lineHeight: 1.08,
      margin: 0,
      color: COLORS.fg,
      ...style,
    }}
  >
    {children}
  </h1>
);

export const Highlight: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      background: "linear-gradient(135deg,#2dd4bf,#0d9488)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontStyle: "italic",
    }}
  >
    {children}
  </span>
);

/** Aparición suave con spring para cualquier hijo. */
export const FadeIn: React.FC<{
  delay?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 22, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)`, ...style }}>
      {children}
    </div>
  );
};
