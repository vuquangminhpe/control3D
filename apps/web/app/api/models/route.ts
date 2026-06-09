export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ok, fail } from "@/lib/response";
import { listModels } from "@/lib/model-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const models = await listModels({
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    format: searchParams.get("format") ?? undefined,
    elementTypeId: searchParams.get("elementTypeId") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
  });

  return ok(models);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return fail("Use POST /api/models/upload for file uploads", 400);
  }

  return fail(
    "Model creation requires a local file upload via /api/models/upload",
    400,
  );
}
