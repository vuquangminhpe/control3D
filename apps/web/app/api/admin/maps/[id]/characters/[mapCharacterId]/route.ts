export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  removeCharacterFromLevel,
  updateLevelMapCharacter,
} from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { updateMapCharacterSchema } from "@control3d/shared/schemas/characters";

type Context = {
  params: Promise<{ id: string; mapCharacterId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id, mapCharacterId } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = updateMapCharacterSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid map character payload", 422);
  }

  const map = await updateLevelMapCharacter(id, mapCharacterId, parsed.data);
  if (!map) return fail("Map character not found", 404);
  return ok(map);
}

export async function DELETE(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id, mapCharacterId } = await params;
  const map = await removeCharacterFromLevel(id, mapCharacterId);
  if (!map) return fail("Map character not found", 404);
  return ok(map);
}
