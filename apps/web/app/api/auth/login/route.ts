export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { loginSchema } from "@control3d/shared/schemas/auth";
import { attachAuthCookies, loginUser } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid login payload", 422);
  }

  try {
    const result = await loginUser({ ...parsed.data, request });
    const response = ok({ user: result.user });
    attachAuthCookies(response, "user", result.tokens);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Login failed", 401);
  }
}
