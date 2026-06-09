export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createModelFromUpload } from "@/lib/model-store";
import { ok, fail } from "@/lib/response";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail("Invalid form data", 422);
  }

  const file = formData.get("file");
  const name = formData.get("name");

  if (!(file instanceof File)) {
    return fail("Model file is required", 422);
  }

  if (typeof name !== "string" || !name.trim()) {
    return fail("Name is required", 422);
  }

  try {
    const model = await createModelFromUpload({
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      name,
      description:
        typeof formData.get("description") === "string"
          ? String(formData.get("description"))
          : undefined,
      tags:
        typeof formData.get("tags") === "string"
          ? String(formData.get("tags"))
          : undefined,
      category:
        typeof formData.get("category") === "string"
          ? String(formData.get("category"))
          : undefined,
      elementTypeId:
        typeof formData.get("elementTypeId") === "string"
          ? String(formData.get("elementTypeId"))
          : undefined,
      license:
        typeof formData.get("license") === "string"
          ? String(formData.get("license"))
          : undefined,
    });

    return ok(model, { status: 201 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload failed", 422);
  }
}
