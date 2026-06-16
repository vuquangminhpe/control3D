export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "admin");
  if (!auth || auth.subjectType !== "admin") {
    return fail("Unauthorized", 401);
  }

  return ok({ admin: auth.admin });
}
