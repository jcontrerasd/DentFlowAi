import React from "react";
import { COLORS, FONT_FAMILY_SANS } from "../style";

/** Chrome de navegador (espeja .mock / .mock-top del HTML). */
export const MockBrowser: React.FC<{
  url: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ url, children, style }) => {
  return (
    <div
      style={{
        background: "#0a1322",
        border: `1px solid ${COLORS.line2}`,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,.45)",
        fontFamily: FONT_FAMILY_SANS,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "13px 18px",
          background: "#0d1626",
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        {["#f87171", "#fbbf24", "#34d399"].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
        ))}
        <span
          style={{
            marginLeft: 14,
            fontSize: 15,
            color: COLORS.muted,
            background: "rgba(2,6,23,.6)",
            padding: "6px 16px",
            borderRadius: 8,
            border: `1px solid ${COLORS.line}`,
          }}
        >
          {url}
        </span>
      </div>
      <div style={{ padding: 30 }}>{children}</div>
    </div>
  );
};
