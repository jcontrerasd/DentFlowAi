import React from "react";

/** Pill genérico (espeja .pill del HTML). */
export const Pill: React.FC<{
  fg: string;
  bg: string;
  border: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ fg, bg, border, children, style }) => {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        fontSize: 18,
        fontWeight: 700,
        color: fg,
        background: bg,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
};
