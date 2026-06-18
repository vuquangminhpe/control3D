import Link from "next/link";
import type { Route } from "next";
import { listPublishedLevels } from "@/lib/model-store";
import { LobbyAuthActions } from "@/components/auth/LobbyAuthActions";
import { evaluateRuntimeBudget } from "@/lib/runtime-budget";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const maps = await listPublishedLevels();
  const featuredMap = maps[0] ?? null;

  return (
    <main className="lobby-page">
      <section className="lobby-hero">
        <div>
          <span className="stat-label">PUBLIC LOBBY</span>
          <h1>Choose a room</h1>
          <p>Published maps only. Pick a world, select an unlocked character, then enter the online room.</p>
        </div>
        <LobbyAuthActions />
      </section>

      {maps.length ? (
        <section className="lobby-layout">
          {featuredMap ? (
            <article className="lobby-featured-map">
              <div>
                <span className="status-pill published">Featured</span>
                <h2>{featuredMap.name}</h2>
                <p>{featuredMap.description || "Ready for public play."}</p>
              </div>
              <div className="lobby-featured-stats">
                <div>
                  <span>Players</span>
                  <strong>{featuredMap.maxPlayers}</strong>
                </div>
                <div>
                  <span>Characters</span>
                  <strong>{featuredMap.mapCharacters.filter((entry) => entry.role === "playable").length}</strong>
                </div>
                <div>
                  <span>Enemies</span>
                  <strong>{featuredMap.zombieSpawns.length}</strong>
                </div>
              </div>
              <Link className="button" href={`/?map=${encodeURIComponent(featuredMap.id)}` as Route}>
                Enter featured room
              </Link>
            </article>
          ) : null}

          <div className="lobby-map-grid">
            {maps.map((map) => {
              const budget = evaluateRuntimeBudget(map);
              const playableCount = map.mapCharacters.filter((entry) => entry.role === "playable").length;
              const npcCount = map.mapCharacters.filter((entry) => entry.role !== "playable").length;
              return (
                <article className="lobby-map-card" key={map.id}>
                  <header>
                    <span className="status-pill published">Published</span>
                    <span className={`runtime-score ${budget.score}`}>{budget.score}</span>
                  </header>
                  <div>
                    <h2>{map.name}</h2>
                    <p>{map.description || "Ready for public play."}</p>
                  </div>
                  <dl className="lobby-map-meta">
                    <div>
                      <dt>Max</dt>
                      <dd>{map.maxPlayers}</dd>
                    </div>
                    <div>
                      <dt>Playable</dt>
                      <dd>{playableCount}</dd>
                    </div>
                    <div>
                      <dt>NPC</dt>
                      <dd>{npcCount}</dd>
                    </div>
                    <div>
                      <dt>Enemies</dt>
                      <dd>{map.zombieSpawns.length}</dd>
                    </div>
                  </dl>
                  <Link className="button secondary" href={`/?map=${encodeURIComponent(map.id)}` as Route}>
                    Select map
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="lobby-empty-state">
          <h2>No published maps yet</h2>
          <p>Admin can publish a draft map from the admin maps screen.</p>
        </section>
      )}
    </main>
  );
}
