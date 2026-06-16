import Link from "next/link";
import type { Route } from "next";
import { listPublishedLevels } from "@/lib/model-store";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const maps = await listPublishedLevels();

  return (
    <main>
      <section className="page-header">
        <div>
          <span className="stat-label">PUBLIC LOBBY</span>
          <h1>Published maps</h1>
          <p className="inline-text">Choose an online-ready map and enter the game.</p>
        </div>
        <div className="inline-actions">
          <Link className="button secondary" href={"/login" as Route}>
            Login
          </Link>
          <Link className="button" href={"/register" as Route}>
            Register
          </Link>
        </div>
      </section>

      {maps.length ? (
        <section className="listing-grid">
          {maps.map((map) => (
            <article className="card map-card" key={map.id}>
              <div>
                <span className="status-pill published">Published</span>
                <h2>{map.name}</h2>
                <p>{map.description || "Ready for public play."}</p>
              </div>
              <dl className="map-meta">
                <div>
                  <dt>Characters</dt>
                  <dd>{map.mapCharacters.length}</dd>
                </div>
                <div>
                  <dt>Max players</dt>
                  <dd>{map.maxPlayers}</dd>
                </div>
              </dl>
              <Link className="button" href={`/?map=${encodeURIComponent(map.id)}`}>
                Play preview
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="card empty-state">
          <h2>No published maps yet</h2>
          <p>Admin can publish a draft map from the admin maps screen.</p>
        </section>
      )}
    </main>
  );
}
