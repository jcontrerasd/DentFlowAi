import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { MockBrowser } from "../components/MockBrowser";
import { WorkflowStepper } from "../components/WorkflowStepper";
import { StatusBadge, CaseStatus } from "../components/StatusBadge";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

export const S7_Fabricacion: React.FC = () => {
  const frame = useCurrentFrame();
  // Fabricación (6) → Enviado (7) → Completado (8)
  const step = interpolate(frame, [20, 250, 430], [6, 7, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const stepNow = Math.round(step);
  const status: CaseStatus = stepNow >= 8 ? "completado" : stepNow >= 7 ? "enviado" : "enFabricacion";

  return (
    <Background padding={70}>
      <Vo file="s7.mp3" />
      <FadeIn>
        <Eyebrow>Paso 6 · Fabricación y entrega</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <MockBrowser url="dentflowai.app › casos › DF-2048" style={{ maxWidth: 1500, margin: "10px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div style={{ fontFamily: FONT_FAMILY_SANS, fontSize: 24, fontWeight: 800, color: COLORS.fg }}>
              DF-2048 · Rehabilitación arco superior
            </div>
            <StatusBadge status={status} />
          </div>
          <div style={{ marginBottom: 26 }}>
            <WorkflowStepper current={stepNow} scale={0.92} />
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontFamily: FONT_FAMILY_SANS,
              opacity: interpolate(frame, [220, 260], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <Info icon="📦" k="Despacho" v="Courier · seguimiento activo" />
            <Info icon="🚚" k="Tracking" v="CL-99X-2048-7731" />
            <Info
              icon="✓"
              k="Recepción"
              v="Confirmada por el dentista"
              highlight={stepNow >= 8}
            />
          </div>
        </MockBrowser>
      </FadeIn>
      <Caption durationInFrames={SCENE_FRAMES.S7}>
        Se fabrica, se despacha con seguimiento y el dentista confirma la recepción. Caso completado.
      </Caption>
    </Background>
  );
};

const Info: React.FC<{ icon: string; k: string; v: string; highlight?: boolean }> = ({
  icon,
  k,
  v,
  highlight,
}) => (
  <div
    style={{
      flex: 1,
      background: highlight ? "rgba(34,197,94,.1)" : "#0d1626",
      border: `1px solid ${highlight ? "rgba(34,197,94,.4)" : COLORS.line}`,
      borderRadius: 12,
      padding: "16px 18px",
    }}
  >
    <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
    <div style={{ color: COLORS.muted, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.8 }}>{k}</div>
    <div style={{ color: COLORS.fg, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{v}</div>
  </div>
);
