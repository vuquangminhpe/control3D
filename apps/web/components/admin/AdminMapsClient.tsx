"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { postEmpty, postJson } from "@/lib/client-auth";
import { evaluateRuntimeBudget, type RuntimeBudgetIssue } from "@/lib/runtime-budget";
import type {
  GameCharacterRecord,
  LevelRecord,
  MapCharacterRole,
} from "@/lib/model-store";

type AdminMePayload = {
  admin: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
};

type AssignmentDraft = {
  characterId: string;
  role: MapCharacterRole;
  isDefault: boolean;
  pointPrice: string;
  storyEnabled: boolean;
};

function reportTone(severity: RuntimeBudgetIssue["severity"] | "ready") {
  if (severity === "error") return "blocked";
  if (severity === "warning") return "review";
  return "ready";
}

function primaryIssueLabel(issues: RuntimeBudgetIssue[]) {
  const error = issues.find((entry) => entry.severity === "error");
  const warning = issues.find((entry) => entry.severity === "warning");
  return error ?? warning ?? null;
}

async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}

export function AdminMapsClient() {
  const [admin, setAdmin] = useState<AdminMePayload["admin"] | null>(null);
  const [maps, setMaps] = useState<LevelRecord[]>([]);
  const [characters, setCharacters] = useState<GameCharacterRecord[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const stats = useMemo(() => {
    return maps.reduce(
      (acc, map) => {
        acc.total += 1;
        acc[map.status] += 1;
        return acc;
      },
      { total: 0, draft: 0, published: 0, archived: 0 },
    );
  }, [maps]);

  const load = async () => {
    setIsLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const me = await getJson<AdminMePayload>("/api/admin/auth/me");
      const [mapRows, characterRows] = await Promise.all([
        getJson<LevelRecord[]>("/api/admin/maps"),
        getJson<GameCharacterRecord[]>("/api/admin/characters"),
      ]);
      setAdmin(me.admin);
      setMaps(mapRows);
      setCharacters(characterRows);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to load admin maps");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const mutateStatus = async (mapId: string, action: "publish" | "unpublish" | "archive") => {
    const targetMap = maps.find((entry) => entry.id === mapId);
    if (action === "publish" && targetMap) {
      const budget = evaluateRuntimeBudget(targetMap);
      const warningCount = budget.issues.filter((entry) => entry.severity === "warning").length;
      if (budget.score === "blocked") {
        const firstError = budget.issues.find((entry) => entry.severity === "error");
        setIsError(true);
        setMessage(firstError ? `${firstError.title}: ${firstError.detail}` : "Map is blocked by runtime budget issues.");
        return;
      }
      if (warningCount > 0) {
        const confirmed = window.confirm(
          `Runtime budget has ${warningCount} warning${warningCount === 1 ? "" : "s"}. Publish anyway?`,
        );
        if (!confirmed) return;
      }
    }

    setMessage(null);
    setIsError(false);
    try {
      await postEmpty(`/api/admin/maps/${encodeURIComponent(mapId)}/${action}`, { csrf: true });
      await load();
      setMessage(`Map ${action} request completed.`);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Map action failed");
    }
  };

  const getDraft = (mapId: string): AssignmentDraft => {
    return (
      assignmentDrafts[mapId] ?? {
        characterId: characters[0]?.id ?? "",
        role: "playable",
        isDefault: false,
        pointPrice: "0",
        storyEnabled: false,
      }
    );
  };

  const updateDraft = (mapId: string, updates: Partial<AssignmentDraft>) => {
    setAssignmentDrafts((current) => ({
      ...current,
      [mapId]: {
        ...getDraft(mapId),
        ...updates,
      },
    }));
  };

  const assignCharacter = async (mapId: string) => {
    const draft = getDraft(mapId);
    if (!draft.characterId) {
      setIsError(true);
      setMessage("Register at least one gameplay character first.");
      return;
    }

    setMessage(null);
    setIsError(false);
    try {
      await postJson(`/api/admin/maps/${encodeURIComponent(mapId)}/characters`, {
        characterId: draft.characterId,
        role: draft.role,
        isDefault: draft.isDefault,
        pointPrice: Number(draft.pointPrice) || 0,
        storyEnabled: draft.storyEnabled,
      }, { csrf: true });
      await load();
      setMessage("Character assigned to map.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Assign character failed");
    }
  };

  if (isLoading) {
    return (
      <main>
        <section className="card empty-state">
          <h1>Loading admin maps</h1>
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
    <main className="admin-console-page">
      <section className="admin-console-hero">
        <div>
          <span className="stat-label">ADMIN MAPS</span>
          <h1>Map operations</h1>
          <p>Publish readiness, runtime budget, and character assignment for public rooms.</p>
        </div>
        <div className="admin-hero-meta">
          <span>{admin.email}</span>
          <strong>{stats.published} live</strong>
        </div>
        <div className="inline-actions admin-hero-actions">
          <button className="button secondary" onClick={() => void load()} type="button">
            Refresh
          </button>
          <Link className="button" href={"/" as Route}>
            Open editor
          </Link>
          <Link className="button secondary" href={"/admin/characters" as Route}>
            Characters
          </Link>
        </div>
      </section>

      <section className="admin-stat-strip">
        <div>
          <span className="stat-label">Total</span>
          <strong className="stat-value">{stats.total}</strong>
        </div>
        <div>
          <span className="stat-label">Draft</span>
          <strong className="stat-value">{stats.draft}</strong>
        </div>
        <div>
          <span className="stat-label">Published</span>
          <strong className="stat-value">{stats.published}</strong>
        </div>
        <div>
          <span className="stat-label">Archived</span>
          <strong className="stat-value">{stats.archived}</strong>
        </div>
      </section>

      {message ? (
        <p className={isError ? "error-text" : "success-text"}>{message}</p>
      ) : null}

      <section className="admin-map-list">
        {maps.map((map) => {
          const budget = evaluateRuntimeBudget(map);
          const primaryIssue = primaryIssueLabel(budget.issues);
          return (
            <article className="admin-map-card" key={map.id}>
              <header className="admin-map-card-header">
                <div>
                  <span className={`status-pill ${map.status}`}>{map.status}</span>
                  <h2>{map.name}</h2>
                  <small>{map.slug || map.id}</small>
                </div>
                <span className={`runtime-score ${budget.score}`}>
                  {budget.score}
                </span>
              </header>

              <div className="runtime-budget-grid">
                <div>
                  <span>Actors</span>
                  <strong>{budget.totals.actorCount}</strong>
                </div>
                <div>
                  <span>Objects</span>
                  <strong>{budget.totals.placedObjectCount}</strong>
                </div>
                <div>
                  <span>Enemies</span>
                  <strong>{budget.totals.enemyCount}</strong>
                </div>
                <div>
                  <span>Playable</span>
                  <strong>{budget.totals.playableCount}</strong>
                </div>
              </div>

              {primaryIssue ? (
                <div className={`runtime-warning ${reportTone(primaryIssue.severity)}`}>
                  <strong>{primaryIssue.title}</strong>
                  <span>{primaryIssue.detail}</span>
                  {budget.issues.length > 1 ? <em>{budget.issues.length - 1} more</em> : null}
                </div>
              ) : (
                <div className="runtime-warning ready">
                  <strong>Runtime budget ready</strong>
                  <span>Map is within current public-room budget.</span>
                </div>
              )}

              <div className="admin-map-card-actions">
                <Link
                  className="button secondary"
                  href={`/admin/maps/${encodeURIComponent(map.id)}/preview` as Route}
                >
                  Preview
                </Link>
                <button
                  className="button"
                  disabled={map.status === "published" || budget.score === "blocked"}
                  onClick={() => void mutateStatus(map.id, "publish")}
                  type="button"
                >
                  Publish
                </button>
                <button
                  className="button secondary"
                  disabled={map.status !== "published"}
                  onClick={() => void mutateStatus(map.id, "unpublish")}
                  type="button"
                >
                  Unpublish
                </button>
                <button
                  className="button danger"
                  disabled={map.status === "archived"}
                  onClick={() => void mutateStatus(map.id, "archive")}
                  type="button"
                >
                  Archive
                </button>
              </div>

              <div className="map-character-assignment">
                <div className="assigned-character-list">
                  {map.mapCharacters.map((character) => (
                    <span className="status-pill" key={character.id}>
                      {character.displayLabel || character.name}
                      {character.isDefault ? " / default" : ""}
                    </span>
                  ))}
                  {!map.mapCharacters.length ? <span className="inline-text">No characters assigned</span> : null}
                </div>

                <div className="assignment-controls">
                  <select
                    aria-label="Gameplay character"
                    onChange={(event) => updateDraft(map.id, { characterId: event.target.value })}
                    value={getDraft(map.id).characterId}
                  >
                    <option value="">Select character</option>
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Map character role"
                    onChange={(event) =>
                      updateDraft(map.id, { role: event.target.value as MapCharacterRole })
                    }
                    value={getDraft(map.id).role}
                  >
                    <option value="playable">Playable</option>
                    <option value="npc">NPC</option>
                    <option value="story_actor">Story actor</option>
                    <option value="boss">Boss</option>
                  </select>
                  <input
                    aria-label="Point price"
                    min="0"
                    onChange={(event) => updateDraft(map.id, { pointPrice: event.target.value })}
                    type="number"
                    value={getDraft(map.id).pointPrice}
                  />
                  <label>
                    <input
                      checked={getDraft(map.id).isDefault}
                      onChange={(event) => updateDraft(map.id, { isDefault: event.target.checked })}
                      type="checkbox"
                    />
                    Default
                  </label>
                  <label>
                    <input
                      checked={getDraft(map.id).storyEnabled}
                      onChange={(event) => updateDraft(map.id, { storyEnabled: event.target.checked })}
                      type="checkbox"
                    />
                    Story
                  </label>
                  <button
                    className="button secondary"
                    disabled={!characters.length}
                    onClick={() => void assignCharacter(map.id)}
                    type="button"
                  >
                    Assign
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!maps.length ? (
          <div className="empty-state">
            <h2>No maps yet</h2>
            <p>Create maps in the editor first.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
