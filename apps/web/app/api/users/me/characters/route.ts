export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateRequest } from "@/lib/auth/session";
import { listUserCharacters } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "user");
  if (!auth || auth.subjectType !== "user") {
    return fail("Unauthorized", 401);
  }

  return ok({ characters: await listUserCharacters(auth.user.id) });
}
