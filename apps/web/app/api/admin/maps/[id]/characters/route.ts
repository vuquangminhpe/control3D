export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  assignCharacterToLevel,
  getLevelById,
} from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { assignMapCharacterSchema } from "@control3d/shared/schemas/characters";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:read");
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const map = await getLevelById(id);
  if (!map) return fail("Map not found", 404);
  return ok(map.mapCharacters);
}

export async function POST(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = assignMapCharacterSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid map character payload", 422);
  }

  const map = await assignCharacterToLevel(id, parsed.data);
  if (!map) return fail("Map or character not found", 404);
  return ok(map);
}
