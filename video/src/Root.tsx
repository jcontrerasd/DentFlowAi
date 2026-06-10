import React from "react";
import { Composition } from "remotion";
import { FPS } from "./theme";
import { MASTER_TOTAL, sec } from "./timing";
import { Master } from "./compositions/Master";
import { Pitch, PITCH_TOTAL } from "./compositions/Pitch";
import { Social1, Social2, Social3 } from "./compositions/SocialClip";

const LANDSCAPE = { width: 1920, height: 1080 };
const VERTICAL = { width: 1080, height: 1920 };
const SOCIAL_FRAMES = sec(18);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Master"
        component={Master}
        durationInFrames={MASTER_TOTAL}
        fps={FPS}
        {...LANDSCAPE}
      />
      <Composition
        id="Pitch"
        component={Pitch}
        durationInFrames={PITCH_TOTAL}
        fps={FPS}
        {...LANDSCAPE}
      />
      <Composition id="Social1" component={Social1} durationInFrames={SOCIAL_FRAMES} fps={FPS} {...VERTICAL} />
      <Composition id="Social2" component={Social2} durationInFrames={SOCIAL_FRAMES} fps={FPS} {...VERTICAL} />
      <Composition id="Social3" component={Social3} durationInFrames={SOCIAL_FRAMES} fps={FPS} {...VERTICAL} />
    </>
  );
};
