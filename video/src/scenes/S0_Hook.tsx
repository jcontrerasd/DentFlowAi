import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Wordmark } from "../components/Wordmark";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

const CHAOS = ["Lab A", "Lab B", "Lab C", "¿a ojo?", "Lab D", "Lab E", "¿quién lo hace?", "Lab F"];

export const S0_Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = spring({ frame: frame - 110, fps, config: { damping: 200 } });
  const chaosOut = interpolate(frame, [95, 115], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Background>
      <Vo file="s0.mp3" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {/* Caos de asignación manual */}
        <AbsoluteFill style={{ opacity: chaosOut, alignItems: "center", justifyContent: "center" }}>
          {CHAOS.map((t, i) => {
            const angle = (i / CHAOS.length) * Math.PI * 2;
            const r = 360 + (i % 3) * 60;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r * 0.55;
            const jitter = Math.sin((frame + i * 20) / 12) * 6;
            return (
              <div
                key={t}
                style={{
                  position: "absolute",
                  transform: `translate(${x}px, ${y + jitter}px) rotate(${(i % 2 ? -1 : 1) * 6}deg)`,
                  fontFamily: FONT_FAMILY_SANS,
                  fontSize: 30,
                  fontWeight: 700,
                  color: t.includes("?") ? COLORS.amber : COLORS.muted,
                  background: "rgba(15,23,42,.8)",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 12,
                  padding: "12px 20px",
                }}
              >
                {t}
              </div>
            );
          })}
        </AbsoluteFill>

        {/* Reveal logo */}
        <div style={{ opacity: logoIn, transform: `scale(${interpolate(logoIn, [0, 1], [0.85, 1])})` }}>
          <Wordmark size={84} />
        </div>
      </AbsoluteFill>
      <Caption durationInFrames={SCENE_FRAMES.S0}>
        Cada día llegan casos a tu laboratorio. ¿Quién decide quién los hace?
      </Caption>
    </Background>
  );
};
