import React from "react";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { MockBrowser } from "../components/MockBrowser";
import { Countdown } from "../components/Countdown";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

const QuoteField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      flex: 1,
      background: "#0d1626",
      border: `1px solid ${COLORS.line}`,
      borderRadius: 12,
      padding: "14px 16px",
      fontFamily: FONT_FAMILY_SANS,
    }}
  >
    <div style={{ color: COLORS.teal, fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
      {label}
    </div>
    <div style={{ color: COLORS.fg, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
  </div>
);

export const S4_Tecnico: React.FC = () => {
  return (
    <Background padding={70}>
      <Vo file="s4.mp3" />
      <FadeIn>
        <Eyebrow>Paso 3 · El técnico cotiza</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <MockBrowser url="dentflowai.app › invitaciones › DF-2048" style={{ maxWidth: 1400, margin: "10px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: FONT_FAMILY_SANS, fontSize: 24, fontWeight: 800, color: COLORS.fg }}>
              Invitación · caso anónimo
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.muted, marginTop: 2 }}>
                Arco completo · 12 piezas · Liga Oro
              </div>
            </div>
            <Countdown startSeconds={30 * 60} label="Plazo para cotizar · Reloj 1" speed={120} />
          </div>

          <div style={{ color: COLORS.muted2, fontFamily: FONT_FAMILY_SANS, fontSize: 16, marginBottom: 12 }}>
            Cotización con desglose <b style={{ color: COLORS.fg }}>diseño + fabricación</b> (caso integral):
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <QuoteField label="Diseño" value="$85.000 · 2 días" />
            <QuoteField label="Fabricación" value="$120.000 · 4 días" />
            <QuoteField label="Total" value="$205.000" />
          </div>

          <FadeIn delay={40}>
            <div
              style={{
                marginTop: 18,
                padding: "13px 18px",
                borderRadius: 12,
                background: "rgba(45,212,191,.06)",
                border: "1px dashed rgba(45,212,191,.4)",
                fontFamily: FONT_FAMILY_SANS,
                fontSize: 16,
                color: COLORS.muted2,
              }}
            >
              <b style={{ color: COLORS.teal }}>Reemplazo automático:</b> si un técnico rechaza, Fauchard
              invita al siguiente del pool. El dentista ni se entera.
            </div>
          </FadeIn>
        </MockBrowser>
      </FadeIn>
      <Caption durationInFrames={SCENE_FRAMES.S4}>
        El técnico recibe el caso anónimo y cotiza diseño y fabricación, con un reloj de 30 minutos.
      </Caption>
    </Background>
  );
};
