export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { bakeAnimationAction } from "@/lib/blender-animation-bake";
import {
  getAnimationAssetById,
  getModelById,
  resolveAnimationActionFile,
} from "@/lib/model-store";
import { getRiggingMetadata } from "@/lib/model-rigging";
import { fail, ok } from "@/lib/response";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as {
    actionId?: unknown;
    animationId?: unknown;
    characterId?: unknown;
  } | null;

  const actionId = typeof payload?.actionId === "string" ? payload.actionId : "";
  const animationId = typeof payload?.animationId === "string" ? payload.animationId : "";
  const characterId = typeof payload?.characterId === "string" ? payload.characterId : "";

  if (!actionId || !animationId || !characterId) {
    return fail("characterId, animationId, and actionId are required", 422);
  }

  const [character, animation] = await Promise.all([
    getModelById(characterId),
    getAnimationAssetById(animationId),
  ]);

  if (!character) return fail("Character not found", 404);
  if (!animation) return fail("Animation not found", 404);

  const rigging = getRiggingMetadata(character);
  if (!rigging.riggedModelUrl) {
    return fail("Auto-rig this character before applying animation actions", 422);
  }

  try {
    const { action, sourcePath } = await resolveAnimationActionFile({
      actionId,
      animation,
    });
    const baked = await bakeAnimationAction({
      action,
      animation,
      animationSourcePath: sourcePath,
      character,
    });

    return ok({
      action,
      animationId: animation.id,
      characterId: character.id,
      cached: baked.cached,
      exportUrl: baked.outputUrl,
      previewUrl: baked.outputUrl,
      stderr: baked.stderr.slice(-4000),
      stdout: baked.stdout.slice(-4000),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to apply animation action", 500);
  }
}
