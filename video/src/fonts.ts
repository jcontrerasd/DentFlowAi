/**
 * Carga de fuentes de marca vía @remotion/google-fonts (se empaquetan en el render,
 * sin depender de red en tiempo de render).
 */
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";

const inter = loadInter();
const instrument = loadInstrumentSerif();

export const FONT_FAMILY = {
  sans: inter.fontFamily,
  serif: instrument.fontFamily,
};

export const fontsReady = Promise.all([inter.waitUntilDone(), instrument.waitUntilDone()]);
