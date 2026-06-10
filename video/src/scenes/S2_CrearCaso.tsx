import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { MockBrowser } from "../components/MockBrowser";
import { Viewer3DLoop } from "../components/Viewer3DLoop";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

const STEPS = ["Paciente", "Clínica", "Estética", "Archivos"];

const STEP_CONTENT = [
  [["Nombre interno", "Rehabilitación arco superior"], ["Urgencia", "Normal"]],
  [["Tipo de servicio", "Diseño + Fabricación"], ["Restauración", "Arco completo · 12 piezas"]],
  [["Material", "Zirconio"], ["Color VITA", "A2"]],
  [["Scans", "superior · inferior · mordida (STL)"], ["Visor 3D", "vista previa"]],
];

export const S2_CrearCaso: React.FC = () => {
  const frame = useCurrentFrame();
  // Avanza por los 4 pasos: ~22f por paso, último paso se queda.
  const active = Math.min(3, Math.floor(interpolate(frame, [20, 200], [0, 4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));

  return (
    <Background padding={70}>
      <Vo file="s2.mp3" />
      <FadeIn>
        <Eyebrow>Paso 1 · El dentista crea el caso</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <MockBrowser url="dentflowai.app › casos › nuevo" style={{ maxWidth: 1500, margin: "10px auto 0" }}>
          {/* Progreso de pasos */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {STEPS.map((s, i) => {
              const on = i <= active;
              return (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    fontFamily: FONT_FAMILY_SANS,
                    textAlign: "center",
                    padding: "12px 0",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 18,
                    color: on ? "#042f2e" : COLORS.muted,
                    background: on ? "linear-gradient(135deg,#0d9488,#2dd4bf)" : "rgba(2,6,23,.4)",
                    border: `1px solid ${on ? "transparent" : COLORS.line}`,
                  }}
                >
                  {i + 1}. {s}
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {STEP_CONTENT[active].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "16px 18px",
                    background: "#0d1626",
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 12,
                    fontFamily: FONT_FAMILY_SANS,
                    fontSize: 20,
                  }}
                >
                  <span style={{ color: COLORS.muted }}>{k}</span>
                  <span style={{ color: COLORS.fg, fontWeight: 700, textAlign: "right" }}>{v}</span>
                </div>
              ))}
              <div
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  padding: "14px 28px",
                  borderRadius: 12,
                  background: active === 3 ? "linear-gradient(135deg,#0d9488,#2dd4bf)" : "rgba(2,6,23,.4)",
                  color: active === 3 ? "#042f2e" : COLORS.muted,
                  fontWeight: 800,
                  fontSize: 20,
                  fontFamily: FONT_FAMILY_SANS,
                  border: `1px solid ${active === 3 ? "transparent" : COLORS.line}`,
                }}
              >
                {active === 3 ? "Publicar caso →" : "Siguiente →"}
              </div>
            </div>
            <AbsoluteFill style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
              <Viewer3DLoop size={300} />
            </AbsoluteFill>
          </div>
        </MockBrowser>
      </FadeIn>
      <Caption durationInFrames={SCENE_FRAMES.S2}>
        En cuatro pasos el dentista define el caso —tipo Diseño + Fabricación— sube los escaneos y publica.
      </Caption>
    </Background>
  );
};
