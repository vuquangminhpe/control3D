export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { getUserPointSummary } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "user");
  if (!auth || auth.subjectType !== "user") {
    return fail("Unauthorized", 401);
  }

  return ok(await getUserPointSummary(auth.user.id));
}
