import React from "react";
import { Series } from "remotion";
import { MusicBed } from "../components/AudioTracks";
import {
  S0_Hook,
  S1_Problema,
  S2_CrearCaso,
  S3_Fauchard,
  S4_Tecnico,
  S5_Comparativo,
  S6_Diseno,
  S7_Fabricacion,
  S8_Valor,
} from "../scenes";
import { SCENE_FRAMES } from "../timing";

/** Master educativo: recorrido punta a punta del caso integral (S0→S8). */
export const Master: React.FC = () => {
  return (
    <>
    <MusicBed />
    <Series>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S0}><S0_Hook /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S1}><S1_Problema /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S2}><S2_CrearCaso /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S3}><S3_Fauchard /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S4}><S4_Tecnico /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S5}><S5_Comparativo /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S6}><S6_Diseno /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S7}><S7_Fabricacion /></Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_FRAMES.S8}><S8_Valor /></Series.Sequence>
    </Series>
    </>
  );
};
