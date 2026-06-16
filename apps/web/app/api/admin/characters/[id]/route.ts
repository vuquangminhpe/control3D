export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  deleteGameCharacter,
  getGameCharacterById,
  updateGameCharacter,
} from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { updateCharacterSchema } from "@control3d/shared/schemas/characters";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "characters:read");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const character = await getGameCharacterById(id);
  if (!character) return fail("Character not found", 404);
  return ok(character);
}

export async function PATCH(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "characters:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = updateCharacterSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid character payload", 422);
  }

  const character = await updateGameCharacter(id, parsed.data);
  if (!character) return fail("Character not found", 404);
  return ok(character);
}

export async function DELETE(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "characters:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const character = await deleteGameCharacter(id);
  if (!character) return fail("Character not found", 404);
  return ok(character);
}
