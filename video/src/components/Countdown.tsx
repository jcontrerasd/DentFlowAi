import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_FAMILY_SERIF } from "../style";

/**
 * Reloj HH:MM:SS que tickea descendente desde `startSeconds`.
 * Acelerado por `speed` para comprimir horas reales en segundos de pantalla.
 */
export const Countdown: React.FC<{
  startSeconds: number;
  label: string;
  speed?: number;
  big?: boolean;
}> = ({ startSeconds, label, speed = 1, big = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = (frame / fps) * speed;
  const remaining = Math.max(0, startSeconds - elapsed);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = Math.floor(remaining % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div
      style={{
        textAlign: "center",
        padding: big ? "20px 26px" : "14px 18px",
        background: "rgba(2,6,23,.5)",
        border: `1px solid ${COLORS.line}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILY_SERIF,
          fontSize: big ? 56 : 38,
          letterSpacing: 2,
          color: remaining < startSeconds * 0.2 ? COLORS.amber : COLORS.teal,
        }}
      >
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
      <div
        style={{
          color: COLORS.muted,
          fontSize: 13,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
};
