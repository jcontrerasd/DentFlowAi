import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { MockBrowser } from "../components/MockBrowser";
import { Countdown } from "../components/Countdown";
import { Viewer3DLoop } from "../components/Viewer3DLoop";
import { WorkflowStepper } from "../components/WorkflowStepper";
import { StatusBadge } from "../components/StatusBadge";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

export const S6_Diseno: React.FC = () => {
  const frame = useCurrentFrame();
  // En revisión (4) → al aprobar pasa a fabricación: el stepper avanza ~al 70%.
  const stepNow = frame > 620 ? 6 : 4;
  const approve = interpolate(frame, [600, 640], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Background padding={70}>
      <Vo file="s6.mp3" />
      <FadeIn>
        <Eyebrow>Paso 5 · Fase de diseño</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <MockBrowser url="dentflowai.app › casos › DF-2048" style={{ maxWidth: 1500, margin: "10px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <StatusBadge status={stepNow >= 6 ? "enFabricacion" : "enRevision"} />
            <Countdown startSeconds={48 * 3600} label="Revisión del dentista · Reloj 3" speed={6000} />
          </div>
          <div style={{ marginBottom: 22 }}>
            <WorkflowStepper current={stepNow} scale={0.92} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "center" }}>
            <Viewer3DLoop size={260} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT_FAMILY_SANS }}>
              <div style={{ color: COLORS.muted2, fontSize: 18 }}>
                El técnico entrega el diseño CAD. El dentista revisa y decide:
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "16px 0",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 19,
                    background: `rgba(34,197,94,${0.15 + approve * 0.5})`,
                    border: `1px solid rgba(34,197,94,${0.4 + approve * 0.5})`,
                    color: "#bbf7d0",
                  }}
                >
                  ✓ Aprobar diseño
                </div>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "16px 0",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 19,
                    background: "rgba(251,191,36,.12)",
                    border: "1px solid rgba(251,191,36,.4)",
                    color: COLORS.amber,
                  }}
                >
                  ↻ Solicitar cambios
                </div>
              </div>
              <div style={{ opacity: approve, color: COLORS.teal, fontWeight: 700, fontSize: 17 }}>
                Aprobado → al ser integral, el caso pasa a <b>fabricación</b> (no cierra aquí).
              </div>
            </div>
          </div>
        </MockBrowser>
      </FadeIn>
      <Caption durationInFrames={SCENE_FRAMES.S6}>
        El técnico entrega y el dentista revisa con 48 horas. Al aprobar, el caso integral pasa a fabricación.
      </Caption>
    </Background>
  );
};
