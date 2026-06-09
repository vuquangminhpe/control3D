export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { fail } from "@/lib/response";

export async function POST() {
  return fail("Thumbnail generation is not implemented in local mode yet", 501);
}
