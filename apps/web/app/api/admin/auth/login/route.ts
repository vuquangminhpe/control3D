export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { adminLoginSchema } from "@control3d/shared/schemas/auth";
import { attachAuthCookies, loginAdmin } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = adminLoginSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid admin login payload", 422);
  }

  try {
    const result = await loginAdmin({ ...parsed.data, request });
    const response = ok({ admin: result.admin });
    attachAuthCookies(response, "admin", result.tokens);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Admin login failed", 401);
  }
}
