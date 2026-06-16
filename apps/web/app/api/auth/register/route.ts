export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { userRegisterSchema } from "@control3d/shared/schemas/auth";
import { attachAuthCookies, registerUser } from "@/lib/auth/session";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = userRegisterSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid register payload", 422);
  }

  try {
    const result = await registerUser({ ...parsed.data, request });
    const response = ok({ user: result.user }, { status: 201 });
    attachAuthCookies(response, "user", result.tokens);
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Register failed", 400);
  }
}
