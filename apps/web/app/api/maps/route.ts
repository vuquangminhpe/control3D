export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { listPublishedLevels } from "@/lib/model-store";
import { ok } from "@/lib/response";

export async function GET() {
  const maps = await listPublishedLevels();
  return ok(maps);
}
