import React from "react";
import { Audio, staticFile } from "remotion";

/**
 * Pistas de audio del video. Por defecto OFF para no romper el render mientras
 * no existan los archivos. Enciéndelas cuando hayas dejado los .mp3 en public/.
 *
 *  - Voz (VO): genera los .mp3 desde script.md y déjalos en  public/audio/sX.mp3
 *              luego pon  HAS_VOICEOVER = true
 *  - Música:   deja una pista en  public/music.mp3
 *              luego pon  HAS_MUSIC = true
 */
export const HAS_VOICEOVER = true;
export const HAS_MUSIC = false;

/** Locución de una escena. Arranca en el frame 0 local de su Series.Sequence. */
export const Vo: React.FC<{ file: string; volume?: number }> = ({ file, volume = 1 }) =>
  HAS_VOICEOVER ? <Audio src={staticFile(`audio/${file}`)} volume={volume} /> : null;

/** Cama musical a bajo volumen para toda una composición. */
export const MusicBed: React.FC<{ volume?: number }> = ({ volume = 0.16 }) =>
  HAS_MUSIC ? <Audio src={staticFile("music.mp3")} volume={volume} loop /> : null;
