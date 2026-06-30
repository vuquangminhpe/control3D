"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { postEmpty, postJson } from "@/lib/client-auth";
import type {
  GameCharacterRecord,
  LevelRecord,
  MapCharacterRole,
  ModelRecord,
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

type MapFormState = {
  name: string;
  description: string;
  mapModelUrl: string;
};

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
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [mapForm, setMapForm] = useState<MapFormState>({
    name: "",
    description: "",
    mapModelUrl: "",
  });
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingMap, setIsCreatingMap] = useState(false);

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

  const mapAssets = useMemo(() => {
    return models.filter((model) => {
      const format = model.format?.toLowerCase();
      return (
        model.category === "environment" ||
        model.category === "architecture" ||
        format === "glb" ||
        format === "gltf" ||
        format === "fbx"
      );
    });
  }, [models]);

  const load = async () => {
    setIsLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const me = await getJson<AdminMePayload>("/api/admin/auth/me");
      const [mapRows, characterRows, modelRows] = await Promise.all([
        getJson<LevelRecord[]>("/api/admin/maps"),
        getJson<GameCharacterRecord[]>("/api/admin/characters"),
        getJson<ModelRecord[]>("/api/models"),
      ]);
      setAdmin(me.admin);
      setMaps(mapRows);
      setCharacters(characterRows);
      setModels(modelRows);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to load admin maps");
    } finally {
      setIsLoading(false);
    }
  };

  const createMap = async () => {
    const name = mapForm.name.trim();
    const mapModelUrl = mapForm.mapModelUrl.trim();
    if (!name || !mapModelUrl) {
      setIsError(true);
      setMessage("Map name and map model URL are required.");
      return;
    }

    setIsCreatingMap(true);
    setMessage(null);
    setIsError(false);
    try {
      const created = await postJson<LevelRecord>("/api/admin/maps", {
        name,
        description: mapForm.description.trim() || undefined,
        status: "draft",
        mapModelUrl,
        playerCharacter: null,
        playerSpawn: [0, 1.5, 0],
        robotSpawn: [0, 0, 0],
        robotStory: "",
        storyGraph: {
          nodes: [
            {
              id: "story-start",
              kind: "start",
              title: "Start",
              text: "Story begins here.",
              position: { x: 96, y: 160 },
            },
          ],
          edges: [],
          variables: [],
        },
        zombieSpawns: [],
        mapCharacters: [],
        placedObjects: [],
        maxPlayers: 50,
      }, { csrf: true });
      setMapForm({ name: "", description: "", mapModelUrl: "" });
      await load();
      setAssignmentDrafts((current) => ({
        ...current,
        [created.id]: {
          characterId: characters[0]?.id ?? "",
          role: "playable",
          isDefault: true,
          pointPrice: "0",
          storyEnabled: false,
        },
      }));
      setMessage("Map created. Select a character below to assign it.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Create map failed");
    } finally {
      setIsCreatingMap(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const mutateStatus = async (mapId: string, action: "publish" | "unpublish" | "archive") => {
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
    <main>
      <section className="page-header">
        <div>
          <span className="stat-label">ADMIN MAPS</span>
          <h1>Map publishing</h1>
          <p className="inline-text">{admin.email}</p>
        </div>
        <div className="inline-actions">
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

      <section className="stat-grid grid grid-4">
        <div className="card">
          <span className="stat-label">Total</span>
          <strong className="stat-value">{stats.total}</strong>
        </div>
        <div className="card">
          <span className="stat-label">Draft</span>
          <strong className="stat-value">{stats.draft}</strong>
        </div>
        <div className="card">
          <span className="stat-label">Published</span>
          <strong className="stat-value">{stats.published}</strong>
        </div>
        <div className="card">
          <span className="stat-label">Archived</span>
          <strong className="stat-value">{stats.archived}</strong>
        </div>
      </section>

      {message ? (
        <p className={isError ? "error-text" : "success-text"}>{message}</p>
      ) : null}

      <section className="admin-split-grid">
        <div className="card admin-form-panel">
          <span className="stat-label">Create map</span>
          <label className="field">
            Name
            <input
              onChange={(event) =>
                setMapForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="New gameplay map"
              value={mapForm.name}
            />
          </label>
          <label className="field">
            Source map asset
            <select
              onChange={(event) => {
                const selected = mapAssets.find((asset) => asset.fileUrl === event.target.value);
                setMapForm((current) => ({
                  ...current,
                  mapModelUrl: event.target.value,
                  name: current.name || selected?.name || "",
                }));
              }}
              value={mapForm.mapModelUrl}
            >
              <option value="">Manual URL or select uploaded map</option>
              {mapAssets.map((model) => (
                <option key={model.id} value={model.fileUrl}>
                  {model.name} ({model.format})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Map model URL
            <input
              onChange={(event) =>
                setMapForm((current) => ({ ...current, mapModelUrl: event.target.value }))
              }
              placeholder="/upload-files/models/environment/map.glb"
              value={mapForm.mapModelUrl}
            />
          </label>
          <label className="field">
            Description
            <textarea
              onChange={(event) =>
                setMapForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              value={mapForm.description}
            />
          </label>
          <button className="button" disabled={isCreatingMap} onClick={() => void createMap()} type="button">
            {isCreatingMap ? "Creating..." : "Create map"}
          </button>
        </div>

        <div className="card admin-list-panel">
          <span className="stat-label">Next steps</span>
          <div className="empty-state">
            <h2>{maps.length ? "Assign and play" : "Add a map asset first"}</h2>
            <p>
              Create a map, assign a playable character as default, publish it,
              then open the editor or Play Game.
            </p>
          </div>
        </div>
      </section>

      <section className="admin-map-table card">
        <div className="admin-map-row admin-map-row-head">
          <span>Name</span>
          <span>Status</span>
          <span>Characters</span>
          <span>Actions</span>
        </div>
        {maps.map((map) => (
          <div className="admin-map-entry" key={map.id}>
            <div className="admin-map-row">
              <div>
                <strong>{map.name}</strong>
                <small>{map.slug}</small>
              </div>
              <span className={`status-pill ${map.status}`}>{map.status}</span>
              <span>{map.mapCharacters.length}</span>
              <div className="inline-actions">
                <button
                  className="button secondary"
                  disabled={map.status === "published"}
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
          </div>
        ))}
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
