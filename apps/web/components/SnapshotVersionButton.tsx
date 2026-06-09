"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SnapshotVersionButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="inline-actions">
      <button
        className="button secondary"
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const response = await fetch(`/api/models/${modelId}/version`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ changeNote: "Manual snapshot" }),
            });
            const payload = (await response.json().catch(() => null)) as {
              success?: boolean;
              error?: string;
            } | null;

            if (!response.ok || !payload?.success) {
              setError(payload?.error ?? "Snapshot failed");
              return;
            }

            setMessage("Version snapshot created");
            router.refresh();
          });
        }}
      >
        {isPending ? "Creating..." : "Create version snapshot"}
      </button>
      {message ? (
        <span className="success-text inline-text">{message}</span>
      ) : null}
      {error ? <span className="error-text inline-text">{error}</span> : null}
    </div>
  );
}
