export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "user");
  if (!auth || auth.subjectType !== "user") {
    return fail("Unauthorized", 401);
  }

  return ok({ user: auth.user });
}
