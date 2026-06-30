export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  createGameCharacter,
  listGameCharacters,
} from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { createCharacterSchema } from "@control3d/shared/schemas/characters";

export async function GET(request: Request) {
  const guard = await requireAdmin(request, "characters:read");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(request.url);
  const characters = await listGameCharacters({
    includeInactive: searchParams.get("includeInactive") === "1",
  });
  return ok(characters);
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request, "characters:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const payload = await request.json().catch(() => null);
  const parsed = createCharacterSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid character payload", 422);
  }

  const character = await createGameCharacter(parsed.data);
  return ok(character, { status: 201 });
}
