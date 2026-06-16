export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createLevel, deleteLevel, getLevelById } from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { createLevelSchema } from "@/lib/validators";

type Context = {
  params: Promise<{ id: string }>;
};

const updateMapSchema = createLevelSchema.partial();

export async function GET(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:read");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const map = await getLevelById(id);
  if (!map) return fail("Map not found", 404);
  return ok(map);
}

export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const current = await getLevelById(id);
  if (!current) return fail("Map not found", 404);

  const payload = await request.json().catch(() => null);
  const parsed = updateMapSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid map payload", 422);
  }

  const updated = await createLevel({
    ...current,
    ...parsed.data,
    id,
  });

  return ok(updated);
}

export async function DELETE(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const deleted = await deleteLevel(id);
  if (!deleted) return fail("Map not found", 404);
  return ok({ deleted: true });
}
