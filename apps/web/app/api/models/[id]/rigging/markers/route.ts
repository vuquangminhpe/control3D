export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { fail, ok } from "@/lib/response";
import { getModelById, updateModel } from "@/lib/model-store";
import {
  getRiggingMetadata,
  isHumanoidRigCandidate,
  normalizeRigMarkers,
  rigMarkerOrder,
  type RiggingMetadata,
} from "@/lib/model-rigging";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return fail("Invalid payload", 422);
  }

  const model = await getModelById(id);
  if (!model) {
    return fail("Model not found", 404);
  }

  if (!isHumanoidRigCandidate(model)) {
    return fail("Only humanoid character assets can use marker-based auto-rigging", 422);
  }

  const markers = normalizeRigMarkers((payload as { markers?: unknown }).markers);
  const missingMarkers = rigMarkerOrder.filter(
    (name) => !markers.some((marker) => marker.name === name),
  );

  if (missingMarkers.length) {
    return fail(`Missing rig markers: ${missingMarkers.join(", ")}`, 422);
  }

  const currentRigging = getRiggingMetadata(model);
  const rigging: RiggingMetadata = {
    ...currentRigging,
    status: "marker_ready",
    rigType: "humanoid",
    source: "manual_markers",
    boneMapPreset: "control3d_humanoid",
    markers,
    statusReason: "Markers saved. Backend Blender rigging job can now generate the armature and skin weights.",
    updatedAt: new Date().toISOString(),
  };

  const updated = await updateModel(id, {
    customProps: {
      ...(model.customProps ?? {}),
      rigging,
    },
  });

  if (!updated) {
    return fail("Failed to save rigging markers", 500);
  }

  return ok({
    model: updated,
    rigging,
    nextStep: "queue_blender_autorig_job",
  });
}
