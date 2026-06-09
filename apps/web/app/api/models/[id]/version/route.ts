export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok, fail } from "@/lib/response";
import { createModelVersion } from "@/lib/model-store";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return fail("Invalid payload", 422);
  }

  if (
    typeof payload.changeNote !== "string" &&
    payload.changeNote !== undefined
  ) {
    return fail("Invalid payload", 422);
  }

  const version = await createModelVersion(
    id,
    typeof payload?.changeNote === "string" ? payload.changeNote : undefined,
  );
  if (!version) {
    return fail("Version create failed", 404);
  }

  return ok(version, { status: 201 });
}
