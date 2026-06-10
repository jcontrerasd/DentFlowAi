import React from "react";
import { Background } from "../components/Background";
import { Caption } from "../components/Caption";
import { Vo } from "../components/AudioTracks";
import { MockBrowser } from "../components/MockBrowser";
import { Countdown } from "../components/Countdown";
import { OffersGrid, Offer } from "../components/OffersGrid";
import { Eyebrow, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";
import { SCENE_FRAMES } from "../timing";

const OFFERS: Offer[] = [
  { id: "A7", diseno: 85000, fabricacion: 120000, dias: 6 },
  { id: "K2", diseno: 90000, fabricacion: 115000, dias: 7 },
  { id: "M9", diseno: 80000, fabricacion: 130000, dias: 5 },
  { id: "R4", diseno: 95000, fabricacion: 125000, dias: 6 },
];

export const S5_Comparativo: React.FC = () => {
  return (
    <Background padding={70}>
      <Vo file="s5.mp3" />
      <FadeIn>
        <Eyebrow>Paso 4 · El dentista compara y elige</Eyebrow>
      </FadeIn>
      <FadeIn delay={6}>
        <MockBrowser url="dentflowai.app › casos › DF-2048" style={{ maxWidth: 1500, margin: "10px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: FONT_FAMILY_SANS, fontSize: 24, fontWeight: 800, color: COLORS.fg }}>
              Ofertas comparativas
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.muted, marginTop: 2 }}>
                Identidades reservadas · solo ves precio, plazo y desglose
              </div>
            </div>
            <Countdown startSeconds={2 * 3600} label="Validez de propuesta · Reloj 2" speed={500} />
          </div>
          <OffersGrid offers={OFFERS} selectedIndex={2} />
        </MockBrowser>
      </FadeIn>
      <Caption durationInFrames={SCENE_FRAMES.S5}>
        El dentista ve un comparativo anónimo —nunca el nombre del técnico— y elige la oferta que prefiere.
      </Caption>
    </Background>
  );
};
