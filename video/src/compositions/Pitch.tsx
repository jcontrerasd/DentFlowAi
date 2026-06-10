import React from "react";
import { Series } from "remotion";
import { MusicBed } from "../components/AudioTracks";
import { S1_Problema, S3_Fauchard, S5_Comparativo, S8_Valor } from "../scenes";
import { sec } from "../timing";

/**
 * Pitch 60–90s: comprime problema → Fauchard → anonimato → valor.
 * Cada escena se recorta a su beat clave (los reveals caen al inicio).
 */
export const PITCH_FRAMES = {
  S1: sec(10),
  S3: sec(26),
  S5: sec(16),
  S8: sec(18),
} as const;

export const PITCH_TOTAL = Object.values(PITCH_FRAMES).reduce((a, b) => a + b, 0);

export const Pitch: React.FC = () => {
  return (
    <>
    <MusicBed />
    <Series>
      <Series.Sequence durationInFrames={PITCH_FRAMES.S1}><S1_Problema /></Series.Sequence>
      <Series.Sequence durationInFrames={PITCH_FRAMES.S3}><S3_Fauchard /></Series.Sequence>
      <Series.Sequence durationInFrames={PITCH_FRAMES.S5}><S5_Comparativo /></Series.Sequence>
      <Series.Sequence durationInFrames={PITCH_FRAMES.S8}><S8_Valor /></Series.Sequence>
    </Series>
    </>
  );
};
