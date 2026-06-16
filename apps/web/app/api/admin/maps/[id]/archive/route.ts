export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { setLevelStatus } from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { ok, fail } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const guard = await requireAdmin(request, "maps:write", { csrf: true });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const map = await setLevelStatus(id, "archived");
  if (!map) return fail("Map not found", 404);
  return ok(map);
}
