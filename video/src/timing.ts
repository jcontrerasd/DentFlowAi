import { FPS } from "./theme";

const sec = (s: number) => Math.round(s * FPS);

/** Duración de cada escena del Master (frames @ 30fps). */
export const SCENE_FRAMES = {
  S0: sec(12), // Hook + logo
  S1: sec(18), // El problema
  S2: sec(30), // Dentista crea el caso (integral)
  S3: sec(40), // Fauchard entra · invitaciones por parámetros
  S4: sec(30), // Lado técnico
  S5: sec(25), // Comparativo y elección
  S6: sec(30), // Fase diseño
  S7: sec(20), // Fase fabricación y entrega
  S8: sec(20), // Cierre de valor + CTA
} as const;

export const MASTER_TOTAL = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);

export { sec };
