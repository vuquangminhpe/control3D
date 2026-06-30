export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createLevel, listLevels } from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";
import { createLevelSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await requireAdmin(request, "maps:read");
  if ("error" in guard) return guard.error;

  const maps = await listLevels();
  return ok(maps);
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const payload = await request.json().catch(() => null);
  const parsed = createLevelSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("Invalid map payload", 422);
  }

  const map = await createLevel(parsed.data);
  return ok(map, { status: 201 });
}
