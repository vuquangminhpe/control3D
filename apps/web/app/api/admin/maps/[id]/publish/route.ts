export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getLevelById, setLevelStatus } from "@/lib/model-store";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { evaluateRuntimeBudget } from "@/lib/runtime-budget";
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

  const budget = evaluateRuntimeBudget(current);
  const blockingIssue = budget.issues.find((entry) => entry.severity === "error");
  if (blockingIssue) {
    return fail(`${blockingIssue.title}: ${blockingIssue.detail}`, 422);
  }

  const map = await setLevelStatus(id, "published");
  return ok(map);
}
