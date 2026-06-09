"use client";

import {
  Bloom,
  EffectComposer,
  SSAO,
  Vignette,
} from "@react-three/postprocessing";

type ViewerPostProcessingProps = {
  enabled: boolean;
};

export function ViewerPostProcessing({
  enabled,
}: ViewerPostProcessingProps) {
  if (!enabled) {
    return null;
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.9} intensity={0.3} />
      <SSAO intensity={150} luminanceInfluence={0.9} radius={0.05} />
      <Vignette darkness={0.5} offset={0.3} />
    </EffectComposer>
  );
}