export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok, fail } from "@/lib/response";
import { updateElementType } from "@/lib/model-store";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return fail("Invalid payload", 422);
  }

  const row = await updateElementType(id, payload as Record<string, unknown>);
  if (!row) {
    return fail("Element type not found", 404);
  }

  return ok(row);
}
