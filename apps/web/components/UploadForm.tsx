"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ElementTypeRecord } from "@/lib/model-store";
import { InspectViewer } from "@/components/ModelViewer";

type UploadFormProps = {
  elementTypes: ElementTypeRecord[];
};

export function UploadForm({ elementTypes }: UploadFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <form
      className="grid form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        const form = event.currentTarget;
        const formData = new FormData(form);

        startTransition(async () => {
          const response = await fetch("/api/models/upload", {
            method: "POST",
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as {
            success?: boolean;
            data?: { id: string };
            error?: string;
          } | null;

          if (!response.ok || !payload?.success || !payload.data) {
            setError(payload?.error ?? "Upload failed");
            return;
          }

          setSuccess("Upload successful");
          form.reset();
          setPreviewName("");
          router.push(`/models/${payload.data.id}`);
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Model file</span>
        <input
          name="file"
          type="file"
          accept=".glb,.gltf,.obj,.fbx,.stl,.ply,.usdz"
          required
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreviewName(file?.name ?? "");
            setPreviewUrl((current) => {
              if (current) {
                URL.revokeObjectURL(current);
              }
              return file ? URL.createObjectURL(file) : null;
            });
          }}
        />
      </label>

      <label className="field">
        <span>Name</span>
        <input name="name" type="text" placeholder="Booth model" required />
      </label>

      <label className="field full-width">
        <span>Description</span>
        <textarea name="description" rows={4} placeholder="Short description" />
      </label>

      <label className="field">
        <span>Tags</span>
        <input name="tags" type="text" placeholder="booth, event, product" />
      </label>

      <label className="field">
        <span>Category</span>
        <select name="category" defaultValue="other">
          <option value="architecture">Architecture</option>
          <option value="character">Character</option>
          <option value="vehicle">Vehicle</option>
          <option value="environment">Environment</option>
          <option value="prop">Prop</option>
          <option value="furniture">Furniture</option>
          <option value="electronics">Electronics</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="field">
        <span>Element type</span>
        <select name="elementTypeId" defaultValue="">
          <option value="">None</option>
          {elementTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>License</span>
        <select name="license" defaultValue="CC0">
          <option value="CC0">CC0</option>
          <option value="CC_BY">CC-BY</option>
          <option value="MIT">MIT</option>
          <option value="proprietary">Proprietary</option>
        </select>
      </label>

      <div className="card subtle full-width">
        <strong>Selected file:</strong> {previewName || "No file selected"}
      </div>

      {previewUrl ? (
        <div className="card full-width viewer-shell compact-viewer">
          <InspectViewer src={previewUrl} variant="preview" />
        </div>
      ) : null}

      {error ? <p className="error-text full-width">{error}</p> : null}
      {success ? <p className="success-text full-width">{success}</p> : null}

      <button className="button" type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload model"}
      </button>
    </form>
  );
}
