import type { LevelRecord, MapCharacterRecord } from "@/lib/model-store";

export type RuntimeBudgetSeverity = "error" | "warning" | "info";

export type RuntimeBudgetIssue = {
  code: string;
  severity: RuntimeBudgetSeverity;
  title: string;
  detail: string;
};

export type RuntimeBudgetReport = {
  score: "blocked" | "review" | "ready";
  issues: RuntimeBudgetIssue[];
  totals: {
    actorCount: number;
    playableCount: number;
    npcCount: number;
    enemyCount: number;
    placedObjectCount: number;
    missingAssetCount: number;
  };
};

const ACTOR_REVIEW_LIMIT = 24;
const ACTOR_BLOCK_LIMIT = 60;
const ENEMY_REVIEW_LIMIT = 40;
const ENEMY_BLOCK_LIMIT = 80;
const PLACED_OBJECT_REVIEW_LIMIT = 80;
const PLACED_OBJECT_BLOCK_LIMIT = 140;

function issue(
  severity: RuntimeBudgetSeverity,
  code: string,
  title: string,
  detail: string,
): RuntimeBudgetIssue {
  return { severity, code, title, detail };
}

function hasFileUrl(value: { fileUrl?: string | null }) {
  return typeof value.fileUrl === "string" && value.fileUrl.trim().length > 0;
}

function hasFormat(value: { format?: string | null }) {
  return typeof value.format === "string" && value.format.trim().length > 0;
}

function assetMissingIssues(
  label: string,
  asset: MapCharacterRecord | LevelRecord["placedObjects"][number],
): RuntimeBudgetIssue[] {
  const issues: RuntimeBudgetIssue[] = [];
  if (!hasFileUrl(asset)) {
    issues.push(issue(
      "error",
      "asset_missing_file",
      `${label} missing file`,
      "Runtime cannot load an actor or object without a file URL.",
    ));
  }
  if ("format" in asset && hasFileUrl(asset) && !hasFormat(asset)) {
    issues.push(issue(
      "warning",
      "asset_missing_format",
      `${label} missing format`,
      "Model format is used for runtime preload and fallback handling.",
    ));
  }
  return issues;
}

export function evaluateRuntimeBudget(map: LevelRecord): RuntimeBudgetReport {
  const issues: RuntimeBudgetIssue[] = [];
  const playable = map.mapCharacters.filter((entry) => entry.role === "playable");
  const actors = map.mapCharacters.filter((entry) =>
    entry.role === "playable" ||
    entry.role === "npc" ||
    entry.role === "story_actor" ||
    entry.role === "boss" ||
    entry.storyEnabled,
  );
  const npcs = actors.filter((entry) => entry.role !== "playable");
  const enemies = map.zombieSpawns ?? [];
  const placedObjects = map.placedObjects ?? [];
  const actorCount = actors.length + enemies.length;

  if (!map.mapModelUrl?.trim()) {
    issues.push(issue(
      "error",
      "map_missing_model",
      "Map model missing",
      "A published map needs a terrain or environment model.",
    ));
  }

  if (!playable.some((entry) => entry.isDefault)) {
    issues.push(issue(
      "error",
      "default_character_missing",
      "Default playable missing",
      "Users need one free/default character before they can enter the room.",
    ));
  }

  const defaultCount = playable.filter((entry) => entry.isDefault).length;
  if (defaultCount > 1) {
    issues.push(issue(
      "warning",
      "multiple_default_characters",
      "Multiple defaults",
      "Keep one default playable character so user selection remains predictable.",
    ));
  }

  if (actorCount > ACTOR_BLOCK_LIMIT) {
    issues.push(issue(
      "error",
      "actor_budget_blocked",
      "Actor budget too high",
      `${actorCount} runtime actors can overload model loading and animation.`,
    ));
  } else if (actorCount > ACTOR_REVIEW_LIMIT) {
    issues.push(issue(
      "warning",
      "actor_budget_review",
      "High actor count",
      `${actorCount} runtime actors may exceed the high-LOD budget on weaker devices.`,
    ));
  }

  if (enemies.length > ENEMY_BLOCK_LIMIT) {
    issues.push(issue(
      "error",
      "enemy_budget_blocked",
      "Enemy budget too high",
      `${enemies.length} enemies can overload server simulation and combat checks.`,
    ));
  } else if (enemies.length > ENEMY_REVIEW_LIMIT) {
    issues.push(issue(
      "warning",
      "enemy_budget_review",
      "Enemy count needs review",
      `${enemies.length} enemies should be split into waves or spawn groups.`,
    ));
  }

  if (placedObjects.length > PLACED_OBJECT_BLOCK_LIMIT) {
    issues.push(issue(
      "error",
      "object_budget_blocked",
      "Placed object budget too high",
      `${placedObjects.length} placed objects can stall render and physics setup.`,
    ));
  } else if (placedObjects.length > PLACED_OBJECT_REVIEW_LIMIT) {
    issues.push(issue(
      "warning",
      "object_budget_review",
      "Placed object count needs review",
      `${placedObjects.length} placed objects should be merged, instanced, or reduced.`,
    ));
  }

  actors.forEach((actor) => {
    issues.push(...assetMissingIssues(actor.displayLabel || actor.name, actor));
  });
  placedObjects.forEach((object) => {
    issues.push(...assetMissingIssues(object.name, object));
  });

  const missingAssetCount = issues.filter((entry) =>
    entry.code === "asset_missing_file" || entry.code === "asset_missing_format"
  ).length;
  const hasErrors = issues.some((entry) => entry.severity === "error");
  const hasWarnings = issues.some((entry) => entry.severity === "warning");

  return {
    score: hasErrors ? "blocked" : hasWarnings ? "review" : "ready",
    issues,
    totals: {
      actorCount,
      playableCount: playable.length,
      npcCount: npcs.length,
      enemyCount: enemies.length,
      placedObjectCount: placedObjects.length,
      missingAssetCount,
    },
  };
}
