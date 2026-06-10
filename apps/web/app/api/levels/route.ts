export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createLevel, listLevels } from "@/lib/model-store";
import { ok, fail } from "@/lib/response";
import { createLevelSchema } from "@/lib/validators";

export async function GET() {
  const levels = await listLevels();
  return ok(levels);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createLevelSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("Invalid level payload", 422);
  }

  const level = await createLevel(parsed.data);
  return ok(level);
}
