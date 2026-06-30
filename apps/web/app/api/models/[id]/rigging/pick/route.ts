export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { normalizeRiggingPreviewView, pickRiggingPoint } from "@/lib/blender-autorig";
import { fail, ok } from "@/lib/response";
import { getModelById } from "@/lib/model-store";
import { isHumanoidRigCandidate } from "@/lib/model-rigging";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const model = await getModelById(id);

  if (!model) return fail("Model not found", 404);
  if (!isHumanoidRigCandidate(model)) {
    return fail("Only humanoid character assets can use rigging raycast pick", 422);
  }
  if (!payload || typeof payload !== "object") {
    return fail("Invalid payload", 422);
  }

  const x = Number((payload as { x?: unknown }).x);
  const y = Number((payload as { y?: unknown }).y);
  const view = normalizeRiggingPreviewView((payload as { view?: unknown }).view);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return fail("Pick coordinates must be normalized numbers from 0 to 1", 422);
  }

  try {
    const pick = await pickRiggingPoint({ model, x, y, view });
    return ok(pick);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to pick rigging marker point", 500);
  }
}
