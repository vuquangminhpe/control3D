export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok, fail } from "@/lib/response";
import {
  deleteModel,
  getModelById,
  getVersionsForModel,
  incrementModelView,
  updateModel,
} from "@/lib/model-store";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  const model = await incrementModelView(id);
  if (!model) return fail("Model not found", 404);

  const versions = await getVersionsForModel(id);
  return ok({ model, versions });
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return fail("Invalid payload", 422);
  }

  const existing = await getModelById(id);
  if (!existing) {
    return fail("Model not found", 404);
  }

  const model = await updateModel(id, payload as Record<string, unknown>);
  if (!model) {
    return fail("Update failed", 500);
  }

  return ok(model);
}

export async function DELETE(_: Request, { params }: Context) {
  const { id } = await params;
  const deleted = await deleteModel(id);
  if (!deleted) {
    return fail("Model not found", 404);
  }

  return ok({ deleted: true });
}
