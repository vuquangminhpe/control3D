export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok, fail } from "@/lib/response";
import { createElementType, getElementTypes } from "@/lib/model-store";
import { createElementTypeSchema } from "@/lib/validators";

export async function GET() {
  return ok(await getElementTypes());
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createElementTypeSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("Invalid payload", 422);
  }

  const row = await createElementType(parsed.data);
  return ok(row, { status: 201 });
}
