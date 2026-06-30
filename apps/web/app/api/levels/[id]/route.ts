export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { deleteLevel, getLevelById } from "@/lib/model-store";
import { ok, fail } from "@/lib/response";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  const level = await getLevelById(id);
  if (!level) return fail("Level not found", 404);
  return ok(level);
}

export async function DELETE(_: Request, { params }: Context) {
  const { id } = await params;
  const deleted = await deleteLevel(id);
  if (!deleted) return fail("Level not found", 404);
  return ok({ deleted: true });
}
