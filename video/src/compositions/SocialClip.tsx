import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Background } from "../components/Background";
import { MusicBed, Vo } from "../components/AudioTracks";
import { Wordmark } from "../components/Wordmark";
import { Title, Highlight, FadeIn } from "../components/ui";
import { COLORS, FONT_FAMILY_SANS } from "../style";

/**
 * Clip social vertical (9:16) — kinetic text + logo. Formato gancho para redes.
 * Parametrizado por titular, subtítulo y un dato destacado.
 */
export const SocialClip: React.FC<{
  kicker: string;
  titleA: string;
  titleHL: string;
  titleB?: string;
  stat: string;
  statLabel: string;
  voFile?: string;
}> = ({ kicker, titleA, titleHL, titleB, stat, statLabel, voFile }) => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 10) * 0.015;
  return (
    <Background padding={80}>
      <MusicBed />
      {voFile ? <Vo file={voFile} /> : null}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start" }}>
        <FadeIn>
          <div
            style={{
              fontFamily: FONT_FAMILY_SANS,
              color: COLORS.teal,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontSize: 30,
              marginBottom: 24,
            }}
          >
            {kicker}
          </div>
        </FadeIn>
        <FadeIn delay={8}>
          <Title size={92} style={{ marginBottom: 40 }}>
            {titleA} <Highlight>{titleHL}</Highlight>
            {titleB ? ` ${titleB}` : ""}
          </Title>
        </FadeIn>
        <FadeIn delay={20}>
          <div
            style={{
              transform: `scale(${pulse})`,
              transformOrigin: "left center",
              background: "linear-gradient(160deg,rgba(13,148,136,.22),rgba(15,23,42,.5))",
              border: "1px solid rgba(45,212,191,.35)",
              borderRadius: 24,
              padding: "30px 40px",
            }}
          >
            <div style={{ fontFamily: FONT_FAMILY_SANS, fontSize: 96, fontWeight: 800, color: COLORS.fg }}>
              {stat}
            </div>
            <div style={{ fontFamily: FONT_FAMILY_SANS, fontSize: 32, color: COLORS.muted2 }}>{statLabel}</div>
          </div>
        </FadeIn>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div style={{ opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <Wordmark size={56} />
        </div>
      </AbsoluteFill>
    </Background>
  );
};

export const Social1: React.FC = () => (
  <SocialClip
    kicker="Motor Fauchard"
    titleA="El motor que"
    titleHL="asigna tus casos"
    titleB="solo."
    stat="6 factores"
    statLabel="deciden quién cotiza cada caso"
    voFile="social1.mp3"
  />
);

export const Social2: React.FC = () => (
  <SocialClip
    kicker="Cotización"
    titleA="Ofertas"
    titleHL="anónimas"
    titleB="con reloj."
    stat="30 min"
    statLabel="para cotizar · comparativo sin nombres"
    voFile="social2.mp3"
  />
);

export const Social3: React.FC = () => (
  <SocialClip
    kicker="De punta a punta"
    titleA="Del caso al"
    titleHL="despacho"
    titleB="sin gestión manual."
    stat="0"
    statLabel="casos perdidos · reemplazo automático"
    voFile="social3.mp3"
  />
);
