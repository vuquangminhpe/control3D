export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { runBlenderAutoRig } from "@/lib/blender-autorig";
import { fail, ok } from "@/lib/response";
import { getModelById, updateModel } from "@/lib/model-store";
import {
  getRiggingMetadata,
  isHumanoidRigCandidate,
  type RiggingMetadata,
} from "@/lib/model-rigging";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, { params }: Context) {
  const { id } = await params;
  const model = await getModelById(id);

  if (!model) {
    return fail("Model not found", 404);
  }

  if (!isHumanoidRigCandidate(model)) {
    return fail("Only humanoid character assets can be auto-rigged", 422);
  }

  const rigging = getRiggingMetadata(model);
  if (!rigging.markers.length) {
    return fail("Save humanoid rig markers before running auto-rig", 422);
  }

  const queuedRigging: RiggingMetadata = {
    ...rigging,
    status: "rigging_queued",
    statusReason: "Blender auto-rig job is running.",
    updatedAt: new Date().toISOString(),
  };
  await updateModel(id, {
    customProps: {
      ...(model.customProps ?? {}),
      rigging: queuedRigging,
    },
  });

  try {
    const result = await runBlenderAutoRig({
      model,
      markers: rigging.markers,
    });

    const completedRigging: RiggingMetadata = {
      ...queuedRigging,
      status: "rigged",
      source: "backend_job",
      riggedModelUrl: result.outputUrl,
      statusReason: "Blender generated a humanoid armature, smoothed skin weights, and multiple Control3D motion-check clips.",
      updatedAt: new Date().toISOString(),
    };
    const updated = await updateModel(id, {
      customProps: {
        ...(model.customProps ?? {}),
        rigging: completedRigging,
      },
    });

    return ok({
      model: updated,
      rigging: completedRigging,
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-4000),
    });
  } catch (error) {
    const failedRigging: RiggingMetadata = {
      ...queuedRigging,
      status: "failed",
      statusReason: error instanceof Error ? error.message : "Blender auto-rig failed",
      updatedAt: new Date().toISOString(),
    };
    await updateModel(id, {
      customProps: {
        ...(model.customProps ?? {}),
        rigging: failedRigging,
      },
    });

    return fail(failedRigging.statusReason ?? "Blender auto-rig failed", 500);
  }
}
