export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { attachAuthCookies, authenticateRequest, refreshAuth } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "admin");
  if (auth?.subjectType === "admin") {
    return ok({ admin: auth.admin });
  }

  try {
    const refreshed = await refreshAuth(request, "admin");
    const response = ok({ admin: refreshed.admin });
    attachAuthCookies(response, "admin", refreshed.tokens);
    return response;
  } catch {
    return fail("Unauthorized", 401);
  }
}
