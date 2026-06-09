"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ElementTypeRecord, ModelRecord } from "@/lib/model-store";

type VectorField = "position" | "rotation" | "scale";
type EditModelFormProps = {
  model: ModelRecord;
  elementTypes: ElementTypeRecord[];
  transformInputs: Record<VectorField, string>;
  onTransformInputChange: (field: VectorField, value: string) => void;
};

function toVectorString(values: [number, number, number]) {
  return values.join(", ");
}

export function EditModelForm({
  model,
  elementTypes,
  onTransformInputChange,
  transformInputs,
}: EditModelFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setError(null);
        const formData = new FormData(event.currentTarget);
        const payload = Object.fromEntries(formData.entries());
        payload.position = transformInputs.position;
        payload.rotation = transformInputs.rotation;
        payload.scale = transformInputs.scale;

        startTransition(async () => {
          const response = await fetch(`/api/models/${model.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = (await response.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
          } | null;

          if (!response.ok || !result?.success) {
            setError(result?.error ?? "Update failed");
            return;
          }

          setMessage("Model updated");
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input name="name" type="text" defaultValue={model.name} required />
      </label>

      <label className="field">
        <span>Category</span>
        <select name="category" defaultValue={model.category}>
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

      <label className="field full-width">
        <span>Description</span>
        <textarea
          name="description"
          rows={4}
          defaultValue={model.description ?? ""}
        />
      </label>

      <label className="field">
        <span>Tags</span>
        <input name="tags" type="text" defaultValue={model.tags.join(", ")} />
      </label>

      <label className="field">
        <span>License</span>
        <select name="license" defaultValue={model.license}>
          <option value="CC0">CC0</option>
          <option value="CC_BY">CC-BY</option>
          <option value="MIT">MIT</option>
          <option value="proprietary">Proprietary</option>
        </select>
      </label>

      <label className="field">
        <span>Element type</span>
        <select name="elementTypeId" defaultValue={model.elementTypeId ?? ""}>
          <option value="">None</option>
          {elementTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Position</span>
        <input
          name="position"
          type="text"
          value={transformInputs.position || toVectorString(model.position)}
          onChange={(event) =>
            onTransformInputChange("position", event.target.value)
          }
        />
      </label>

      <label className="field">
        <span>Rotation (deg)</span>
        <input
          name="rotation"
          type="text"
          value={transformInputs.rotation || toVectorString(model.rotation)}
          onChange={(event) =>
            onTransformInputChange("rotation", event.target.value)
          }
        />
      </label>

      <label className="field">
        <span>Scale</span>
        <input
          name="scale"
          type="text"
          value={transformInputs.scale || toVectorString(model.scale)}
          onChange={(event) =>
            onTransformInputChange("scale", event.target.value)
          }
        />
      </label>

      <p className="full-width helper-text">
        TransformControls and these numeric fields stay in sync. Rotation values
        are stored in degrees.
      </p>

      {error ? <p className="error-text full-width">{error}</p> : null}
      {message ? <p className="success-text full-width">{message}</p> : null}

      <button className="button" type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
