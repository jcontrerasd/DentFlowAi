import React from "react";
import { AbsoluteFill } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { Wordmark } from "../components/Wordmark";
import { Eyebrow, Title, Highlight, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

const VALUES = [
  ["Orden en la entrada", "Cada caso llega clasificado por nivel y categoría."],
  ["Asignación pareja", "La misma regla para todos, premiando calidad y puntualidad."],
  ["Cero casos perdidos", "Si nadie está disponible, espera y reintenta; reemplazo automático."],
  ["Listo para escalar", "Más casos sin más gestión manual. Orquestación de punta a punta."],
];

export const S8_Valor: React.FC = () => {
  return (
    <Background padding={70}>
      <Vo file="s8.mp3" />
      <FadeIn>
        <Eyebrow>Por qué importa</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <Title size={52} style={{ maxWidth: 1300, marginBottom: 34 }}>
          <Highlight>FAUCHARD</Highlight> trabaja, tú produces.
        </Title>
      </FadeIn>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 1300 }}>
        {VALUES.map(([t, d], i) => (
          <FadeIn key={t} delay={18 + i * 10}>
            <div
              style={{
                background: "linear-gradient(180deg,#0f172a,#0b1220)",
                border: `1px solid ${COLORS.line}`,
                borderRadius: 16,
                padding: "20px 22px",
                fontFamily: FONT_FAMILY_SANS,
              }}
            >
              <div style={{ color: COLORS.fg, fontWeight: 800, fontSize: 22, marginBottom: 6 }}>{t}</div>
              <div style={{ color: COLORS.muted2, fontSize: 17 }}>{d}</div>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={70}>
        <div style={{ marginTop: 36, fontFamily: FONT_FAMILY_SANS, color: COLORS.muted, fontSize: 17 }}>
          Funciona igual para <b style={{ color: COLORS.muted2 }}>solo diseño</b> y{" "}
          <b style={{ color: COLORS.muted2 }}>solo fabricación</b> — atajos del mismo motor.
        </div>
      </FadeIn>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 240 }}>
        <FadeIn delay={90}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <Wordmark size={56} />
            <div
              style={{
                padding: "16px 34px",
                borderRadius: 999,
                background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
                color: "#042f2e",
                fontWeight: 800,
                fontSize: 22,
                fontFamily: FONT_FAMILY_SANS,
              }}
            >
              Súmate como early adopter →
            </div>
          </div>
        </FadeIn>
      </AbsoluteFill>
      <Caption durationInFrames={SCENE_FRAMES.S8}>
        Orden, asignación pareja y cero casos perdidos. Fauchard trabaja; tu laboratorio produce.
      </Caption>
    </Background>
  );
};
