"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DeleteModelButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-actions">
      <button
        className="button danger"
        type="button"
        disabled={isPending}
        onClick={() => {
          const confirmed = window.confirm(
            "Delete this model and all local files?",
          );
          if (!confirmed) return;

          setError(null);
          startTransition(async () => {
            const response = await fetch(`/api/models/${modelId}`, {
              method: "DELETE",
            });
            const payload = (await response.json().catch(() => null)) as {
              success?: boolean;
              error?: string;
            } | null;

            if (!response.ok || !payload?.success) {
              setError(payload?.error ?? "Delete failed");
              return;
            }

            router.push("/models");
            router.refresh();
          });
        }}
      >
        {isPending ? "Deleting..." : "Delete model"}
      </button>
      {error ? <span className="error-text inline-text">{error}</span> : null}
    </div>
  );
}
