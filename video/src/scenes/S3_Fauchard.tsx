import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { FauchardCore } from "../components/FauchardCore";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

/** 5 técnicos invitados (anónimos) que aparecen al final del beat. */
const InvitedTechs: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {["A7", "K2", "M9", "R4", "T1"].map((id, i) => {
        const s = spring({ frame: frame - startFrame - i * 7, fps, config: { damping: 200 } });
        return (
          <div
            key={id}
            style={{
              opacity: s,
              transform: `translateX(${interpolate(s, [0, 1], [40, 0])}px)`,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "rgba(45,212,191,.06)",
              border: "1px solid rgba(45,212,191,.25)",
              borderRadius: 12,
              fontFamily: FONT_FAMILY_SANS,
              minWidth: 260,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#0d9488,#2dd4bf)",
                color: "#042f2e",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {id}
            </div>
            <div>
              <div style={{ color: COLORS.fg, fontWeight: 700, fontSize: 17 }}>Técnico invitado</div>
              <div style={{ color: COLORS.muted, fontSize: 13 }}>Liga Oro · anónimo</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const S3_Fauchard: React.FC = () => {
  const frame = useCurrentFrame();
  const arrow = interpolate(frame, [180, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Background padding={70}>
      <Vo file="s3.mp3" />
      <FadeIn>
        <Eyebrow>Paso 2 · El motor entra en acción</Eyebrow>
      </FadeIn>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, flexDirection: "row" }}>
        <FadeIn delay={6}>
          <FauchardCore revealStartFrame={20} perStep={34} />
        </FadeIn>
        <div style={{ opacity: arrow, transform: `translateX(${interpolate(arrow, [0, 1], [-20, 0])}px)` }}>
          <div style={{ color: COLORS.teal, fontSize: 40, marginBottom: 12, textAlign: "center" }}>→</div>
          <InvitedTechs startFrame={200} />
        </div>
      </AbsoluteFill>
      <Caption durationInFrames={SCENE_FRAMES.S3}>
        Fauchard clasifica el nivel, filtra y puntúa a los técnicos con seis factores, e invita a los cinco mejores —de forma anónima.
      </Caption>
    </Background>
  );
};
