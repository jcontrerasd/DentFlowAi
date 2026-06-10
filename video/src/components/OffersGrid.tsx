import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY_SANS } from "../style";

export type Offer = {
  id: string; // anónimo, p. ej. "A7"
  diseno: number;
  fabricacion: number;
  dias: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

/**
 * Comparativo anónimo de ofertas con desglose diseño/fabricación (integral, kind 'split').
 * Espeja ComparativeOffersPanel + UchQuoteBreakdown. `selectedIndex` resalta la elegida.
 */
export const OffersGrid: React.FC<{ offers: Offer[]; selectedIndex?: number }> = ({
  offers,
  selectedIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${offers.length}, 1fr)`, gap: 16 }}>
      {offers.map((o, i) => {
        const enter = spring({ frame: frame - i * 6, fps, config: { damping: 200 } });
        const total = o.diseno + o.fabricacion;
        const selected = selectedIndex === i;
        const selGlow = selected
          ? interpolate(frame, [70, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          : 0;
        return (
          <div
            key={o.id}
            style={{
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
              background: "#0d1626",
              border: `1px solid ${selected ? `rgba(45,212,191,${0.35 + selGlow * 0.5})` : COLORS.line}`,
              borderRadius: 14,
              padding: 18,
              fontFamily: FONT_FAMILY_SANS,
              boxShadow: selected ? `0 0 ${30 * selGlow}px rgba(45,212,191,${0.3 * selGlow})` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
                  color: "#042f2e",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {o.id}
              </div>
              <div style={{ color: COLORS.muted, fontSize: 13 }}>Identidad reservada</div>
            </div>
            <Row k="Diseño" v={fmt(o.diseno)} />
            <Row k="Fabricación" v={fmt(o.fabricacion)} />
            <Row k="Plazo" v={`${o.dias} días`} />
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${COLORS.line}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: COLORS.muted, fontSize: 14 }}>Total</span>
              <span style={{ color: COLORS.fg, fontWeight: 800, fontSize: 22 }}>{fmt(total)}</span>
            </div>
            {selected && selGlow > 0.5 && (
              <div
                style={{
                  marginTop: 12,
                  textAlign: "center",
                  color: "#042f2e",
                  fontWeight: 800,
                  fontSize: 14,
                  background: COLORS.teal,
                  borderRadius: 9,
                  padding: "8px 0",
                }}
              >
                ✓ Elegida
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 16 }}>
    <span style={{ color: COLORS.muted }}>{k}</span>
    <span style={{ color: COLORS.fg, fontWeight: 600 }}>{v}</span>
  </div>
);
