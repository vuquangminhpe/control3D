export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getLevelById, setLevelStatus } from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:publish", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const current = await getLevelById(id);
  if (!current) return fail("Map not found", 404);
  if (!current.mapModelUrl || !current.playerSpawn) {
    return fail("Map needs a model and player spawn before publishing", 422);
  }
  if (!current.mapCharacters.some((entry) => entry.role === "playable" && entry.isDefault)) {
    return fail("Map needs one default playable character before publishing", 422);
  }

  const map = await setLevelStatus(id, "published");
  return ok(map);
}
