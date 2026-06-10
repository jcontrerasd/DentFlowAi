import React from "react";
import { AbsoluteFill } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { Eyebrow, Title, Highlight, FadeIn } from "../components/ui";
import { COLORS } from "../style";
import { SCENE_FRAMES } from "../timing";

const PAINS = [
  "Asignar a ojo, según memoria o ánimo",
  "Casos que se quedan en un cajón",
  "Sin trazabilidad ni plazos claros",
];

export const S1_Problema: React.FC = () => {
  return (
    <Background>
      <Vo file="s1.mp3" />
      <AbsoluteFill style={{ justifyContent: "center", maxWidth: 1500, margin: "0 auto" }}>
        <FadeIn>
          <Eyebrow>El problema</Eyebrow>
        </FadeIn>
        <FadeIn delay={8}>
          <Title size={58} style={{ maxWidth: 1200, marginBottom: 40 }}>
            Coordinar laboratorio y clínica <Highlight>a mano</Highlight> no escala.
          </Title>
        </FadeIn>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {PAINS.map((p, i) => (
            <FadeIn key={p} delay={22 + i * 12}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 28,
                  color: COLORS.muted2,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(239,68,68,.15)",
                    border: "1px solid rgba(239,68,68,.4)",
                    color: COLORS.rojo,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  ✕
                </span>
                {p}
              </div>
            </FadeIn>
          ))}
        </div>
      </AbsoluteFill>
      <Caption durationInFrames={SCENE_FRAMES.S1}>
        Decidir a mano quién toma cada caso no escala: se pierde tiempo, trazabilidad y casos.
      </Caption>
    </Background>
  );
};
