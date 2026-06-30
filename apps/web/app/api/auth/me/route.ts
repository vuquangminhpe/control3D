export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { attachAuthCookies, authenticateRequest, refreshAuth } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "user");
  if (auth?.subjectType === "user") {
    return ok({ user: auth.user });
  }

  try {
    const refreshed = await refreshAuth(request, "user");
    const response = ok({ user: refreshed.user });
    attachAuthCookies(response, "user", refreshed.tokens);
    return response;
  } catch {
    return fail("Unauthorized", 401);
  }
}
