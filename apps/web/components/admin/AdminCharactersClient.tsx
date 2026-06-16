"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createCharacterSchema } from "@control3d/shared/schemas/characters";
import { deleteJson, postJson } from "@/lib/client-auth";
import type { GameCharacterRecord, ModelRecord } from "@/lib/model-store";

type AdminMePayload = {
  admin: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
};

type CharacterFormState = {
  name: string;
  description: string;
  modelId: string;
  fileUrl: string;
  format: string;
};

async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}

const emptyForm: CharacterFormState = {
  name: "",
  description: "",
  modelId: "",
  fileUrl: "",
  format: "",
};

export function AdminCharactersClient() {
  const [admin, setAdmin] = useState<AdminMePayload["admin"] | null>(null);
  const [characters, setCharacters] = useState<GameCharacterRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [form, setForm] = useState<CharacterFormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const characterModels = useMemo(
    () => models.filter((model) => model.category === "character"),
    [models],
  );

  const activeCount = useMemo(
    () => characters.filter((character) => character.isActive).length,
    [characters],
  );

  const load = async () => {
    setIsLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const me = await getJson<AdminMePayload>("/api/admin/auth/me");
      const [characterRows, modelRows] = await Promise.all([
        getJson<GameCharacterRecord[]>("/api/admin/characters?includeInactive=1"),
        getJson<ModelRecord[]>("/api/models?category=character"),
      ]);
      setAdmin(me.admin);
      setCharacters(characterRows);
      setModels(modelRows);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to load characters");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (field: keyof CharacterFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const pickModel = (modelId: string) => {
    const model = models.find((entry) => entry.id === modelId);
    if (!model) {
      setForm((current) => ({ ...current, modelId: "", fileUrl: "", format: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      modelId: model.id,
      name: current.name || model.name,
      description: current.description || model.description || "",
      fileUrl: model.fileUrl,
      format: model.format,
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsError(false);

    const parsed = createCharacterSchema.safeParse({
      name: form.name,
      description: form.description || undefined,
      modelId: form.modelId || undefined,
      fileUrl: form.fileUrl,
      format: form.format || undefined,
      isActive: true,
    });

    if (!parsed.success) {
      setIsError(true);
      setMessage(parsed.error.issues[0]?.message ?? "Invalid character form");
      return;
    }

    setIsSubmitting(true);
    try {
      await postJson<GameCharacterRecord>("/api/admin/characters", parsed.data, {
        csrf: true,
      });
      setForm(emptyForm);
      await load();
      setMessage("Character registered for gameplay.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Create character failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const archiveCharacter = async (id: string) => {
    setMessage(null);
    setIsError(false);
    try {
      await deleteJson(`/api/admin/characters/${encodeURIComponent(id)}`, {
        csrf: true,
      });
      await load();
      setMessage("Character archived.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Archive character failed");
    }
  };

  if (isLoading) {
    return (
      <main>
        <section className="card empty-state">
          <h1>Loading characters</h1>
        </section>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="auth-eyebrow">ADMIN ACCESS</span>
          <h1>Admin login required</h1>
          {message ? <p className="error-text">{message}</p> : null}
          <Link className="button" href={"/admin/login" as Route}>
            Login as admin
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="page-header">
        <div>
          <span className="stat-label">ADMIN CHARACTERS</span>
          <h1>Gameplay character registry</h1>
          <p className="inline-text">{admin.email}</p>
        </div>
        <div className="inline-actions">
          <button className="button secondary" onClick={() => void load()} type="button">
            Refresh
          </button>
          <Link className="button" href={"/admin/maps" as Route}>
            Assign to maps
          </Link>
        </div>
      </section>

      <section className="stat-grid grid grid-3">
        <div className="card">
          <span className="stat-label">Registered</span>
          <strong className="stat-value">{characters.length}</strong>
        </div>
        <div className="card">
          <span className="stat-label">Active</span>
          <strong className="stat-value">{activeCount}</strong>
        </div>
        <div className="card">
          <span className="stat-label">Character assets</span>
          <strong className="stat-value">{characterModels.length}</strong>
        </div>
      </section>

      {message ? (
        <p className={isError ? "error-text" : "success-text"}>{message}</p>
      ) : null}

      <section className="admin-split-grid">
        <form className="card admin-form-panel" onSubmit={submit}>
          <span className="stat-label">Register character</span>
          <label className="field">
            Source asset
            <select
              onChange={(event) => pickModel(event.target.value)}
              value={form.modelId}
            >
              <option value="">Manual file URL</option>
              {characterModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.format})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Name
            <input
              onChange={(event) => setField("name", event.target.value)}
              required
              value={form.name}
            />
          </label>

          <label className="field">
            File URL
            <input
              onChange={(event) => setField("fileUrl", event.target.value)}
              required
              value={form.fileUrl}
            />
          </label>

          <label className="field">
            Format
            <input
              onChange={(event) => setField("format", event.target.value)}
              value={form.format}
            />
          </label>

          <label className="field">
            Description
            <textarea
              onChange={(event) => setField("description", event.target.value)}
              rows={4}
              value={form.description}
            />
          </label>

          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Registering..." : "Register character"}
          </button>
        </form>

        <section className="card admin-list-panel">
          <span className="stat-label">Registered characters</span>
          {characters.map((character) => (
            <article className="admin-character-row" key={character.id}>
              <div>
                <strong>{character.name}</strong>
                <small>{character.fileUrl}</small>
              </div>
              <span className={`status-pill ${character.isActive ? "published" : "archived"}`}>
                {character.isActive ? "active" : "archived"}
              </span>
              <button
                className="button danger"
                disabled={!character.isActive}
                onClick={() => void archiveCharacter(character.id)}
                type="button"
              >
                Archive
              </button>
            </article>
          ))}
          {!characters.length ? (
            <div className="empty-state">
              <h2>No gameplay characters</h2>
              <p>Register character assets before assigning them to maps.</p>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
