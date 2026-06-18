import type { EnemyType } from "@/store/gameStore";

export type EnemyRuntimeType = EnemyType | "zombie_low" | "zombie_fantasy";

export type RuntimeActorDimensions = {
  visualHeight: number;
  bodyRadius: number;
  hitRadius: number;
  capsuleHalfHeight: number;
  capsuleCenterY: number;
  labelY: number;
};

function capsuleHalfHeight(visualHeight: number, radius: number) {
  return Math.max(0.08, (visualHeight - radius * 2) / 2);
}

function buildDimensions(input: {
  visualHeight: number;
  bodyRadius: number;
  hitRadius: number;
  labelPadding: number;
}): RuntimeActorDimensions {
  return {
    visualHeight: input.visualHeight,
    bodyRadius: input.bodyRadius,
    hitRadius: input.hitRadius,
    capsuleHalfHeight: capsuleHalfHeight(input.visualHeight, input.bodyRadius),
    capsuleCenterY: input.visualHeight / 2,
    labelY: input.visualHeight + input.labelPadding,
  };
}

export function getPlayerDimensions(mapScaleRatio: number): RuntimeActorDimensions {
  const scale = Math.max(mapScaleRatio, 0.001);
  return buildDimensions({
    visualHeight: 1.85 * scale,
    bodyRadius: 0.34 * scale,
    hitRadius: 0.5 * scale,
    labelPadding: 0.4 * scale,
  });
}

export function getEnemyDimensions(
  type: EnemyRuntimeType,
  mapScaleRatio: number,
): RuntimeActorDimensions {
  const scale = Math.max(mapScaleRatio, 0.001);
  const isFantasy = type === "zombie_fantasy";
  return buildDimensions({
    visualHeight: (isFantasy ? 2.05 : 1.8) * scale,
    bodyRadius: (isFantasy ? 0.48 : 0.42) * scale,
    hitRadius: (isFantasy ? 1.05 : 0.75) * scale,
    labelPadding: 0.3 * scale,
  });
}

export function getNpcDimensions(kind: string, mapScaleRatio: number): RuntimeActorDimensions {
  const scale = Math.max(mapScaleRatio, 0.001);
  const isBoss = kind === "boss";
  return buildDimensions({
    visualHeight: (isBoss ? 2.45 : 1.85) * scale,
    bodyRadius: (isBoss ? 0.62 : 0.36) * scale,
    hitRadius: (isBoss ? 1.35 : 0.58) * scale,
    labelPadding: 0.35 * scale,
  });
}
