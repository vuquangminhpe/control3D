export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { attachAuthCookies, refreshAuth } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const result = await refreshAuth(request, "admin");
    const response = ok({ admin: result.admin });
    attachAuthCookies(response, "admin", result.tokens);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Admin refresh failed", 401);
  }
}
