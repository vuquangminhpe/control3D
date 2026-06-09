export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok } from "@/lib/response";
import { getStats } from "@/lib/model-store";

export async function GET() {
  return ok(await getStats());
}
