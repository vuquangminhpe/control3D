export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { attachAuthCookies, refreshAuth } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const result = await refreshAuth(request, "user");
    const response = ok({ user: result.user });
    attachAuthCookies(response, "user", result.tokens);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Refresh failed", 401);
  }
}
