export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  createCharacterWithActionsFromUpload,
  createModelFromUpload,
  extractFileFromZip,
  getAnimationFormatFromFilename,
  getFormatFromFilename,
  listBundleEntriesFromZip,
} from "@/lib/model-store";
import { ok, fail } from "@/lib/response";

type UploadPart = {
  fileBuffer: Buffer;
  fileName: string;
};

function cleanName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function isZipFile(fileName: string) {
  return fileName.toLowerCase().endsWith(".zip");
}

async function getUploadParts(formData: FormData) {
  const multiFiles = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const singleFile = formData.get("file");
  const sourceFiles = multiFiles.length
    ? multiFiles
    : singleFile instanceof File
      ? [singleFile]
      : [];

  const parts: UploadPart[] = [];
  for (const file of sourceFiles) {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (isZipFile(file.name)) {
      const entries = listBundleEntriesFromZip(fileBuffer);
      if (entries.length) {
        for (const entry of entries) {
          parts.push({
            fileBuffer: extractFileFromZip(fileBuffer, entry),
            fileName: entry,
          });
        }
        continue;
      }
    }
    parts.push({
      fileBuffer,
      fileName: file.name,
    });
  }
  return parts;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail("Invalid form data", 422);
  }

  const parts = await getUploadParts(formData);
  const name = formData.get("name");

  if (!parts.length) {
    return fail("Model file is required", 422);
  }

  if (typeof name !== "string" || !name.trim()) {
    return fail("Name is required", 422);
  }

  try {
    const characterFileName = typeof formData.get("characterFileName") === "string"
      ? String(formData.get("characterFileName"))
      : "";
    const modelParts = parts.filter((part) => getFormatFromFilename(part.fileName));
    const actionParts = parts.filter((part) => getAnimationFormatFromFilename(part.fileName));

    if (!modelParts.length) {
      return fail("Upload must include a character model file", 422);
    }

    const explicitCharacter = characterFileName
      ? modelParts.find((part) => part.fileName === characterFileName || part.fileName.endsWith(`/${characterFileName}`))
      : null;
    const glbCharacter = modelParts.find((part) => {
      const format = getFormatFromFilename(part.fileName);
      return format === "glb" || format === "gltf";
    });
    const characterPart = explicitCharacter
      ?? glbCharacter
      ?? (modelParts.length === 1 ? modelParts[0] : null);

    if (!characterPart) {
      return fail("Choose which FBX file is the character. The other FBX files will be saved as actions.", 422);
    }

    const attachedActions = parts.filter((part) => {
      return part.fileName !== characterPart.fileName && Boolean(getAnimationFormatFromFilename(part.fileName));
    });

    const commonInput = {
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
    };

    const model = attachedActions.length
      ? await createCharacterWithActionsFromUpload({
          ...commonInput,
          characterFileName: characterPart.fileName,
          characterFileBuffer: characterPart.fileBuffer,
          actionFiles: attachedActions,
        })
      : await createModelFromUpload({
          ...commonInput,
          fileName: characterPart.fileName,
          fileBuffer: characterPart.fileBuffer,
        });

    return ok(model, { status: 201 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload failed", 422);
  }
}
