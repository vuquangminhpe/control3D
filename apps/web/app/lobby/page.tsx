"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import type { LevelRecord } from "@/lib/model-store";

function getMapStatus(map: LevelRecord) {
  return map.status ?? "draft";
}

function workbenchHref(mapId: string, tab: "play" | "npc" | "character" | "lobby") {
  return `/?map=${encodeURIComponent(mapId)}&tab=${tab}` as Route;
}

export default function LobbyPage() {
  const [maps, setMaps] = useState<LevelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const endpoints = ["/api/admin/maps", "/api/levels"];
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
            continue;
          }

          if (!cancelled) {
            setMaps(
              payload.data.filter(
                (map: LevelRecord) => getMapStatus(map) !== "archived",
              ),
            );
            setIsLoading(false);
          }
          return;
        } catch {
          // Try the next Java API endpoint.
        }
      }

      if (!cancelled) {
        setError("Không tải được danh sách Map Game từ Java BE.");
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedMaps = useMemo(
    () =>
      [...maps].sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      }),
    [maps],
  );

  return (
    <main>
      <section className="page-header">
        <div>
          <span className="stat-label">MAP GAME SETUP</span>
          <h1>Chọn Map Game</h1>
          <p className="inline-text">
            Chọn một Map Game đã tạo để chỉnh Lobby, thêm NPC, chọn Character hoặc vào chơi thử.
          </p>
        </div>
        <div className="inline-actions">
          <Link className="button secondary" href={"/?tab=maps" as Route}>
            All Games
          </Link>
          <Link className="button" href={"/?tab=editor" as Route}>
            Create Map Game
          </Link>
        </div>
      </section>

      {error ? (
        <section className="card empty-state">
          <h2>Không tải được Map Game</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="card empty-state">
          <h2>Đang tải Map Game</h2>
          <p>Đang lấy dữ liệu từ Java BE.</p>
        </section>
      ) : null}

      {!isLoading && !error && sortedMaps.length ? (
        <section className="listing-grid">
          {sortedMaps.map((map) => {
            const status = getMapStatus(map);
            return (
              <article className="card map-card" key={map.id}>
                <div>
                  <span className={`status-pill ${status}`}>{status}</span>
                  <h2>{map.name}</h2>
                  <p>{map.description || "Map Game đã lưu trên Java BE."}</p>
                </div>
                <dl className="map-meta">
                  <div>
                    <dt>Map layers</dt>
                    <dd>{map.placedObjects.length + 1}</dd>
                  </div>
                  <div>
                    <dt>NPC</dt>
                    <dd>{map.robotSpawn ? 1 : 0}</dd>
                  </div>
                </dl>
                <div className="inline-actions">
                  <Link className="button" href={workbenchHref(map.id, "lobby")}>
                    Edit Lobby
                  </Link>
                  <Link className="button secondary" href={workbenchHref(map.id, "npc")}>
                    Add NPC
                  </Link>
                  <Link className="button secondary" href={workbenchHref(map.id, "character")}>
                    Character
                  </Link>
                  <Link className="button secondary" href={workbenchHref(map.id, "play")}>
                    Play
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {!isLoading && !error && !sortedMaps.length ? (
        <section className="card empty-state">
          <h2>Chưa có Map Game</h2>
          <p>Hãy upload map và tạo Map Game trước, sau đó quay lại để thêm NPC hoặc chỉnh Lobby.</p>
          <Link className="button" href={"/?tab=editor" as Route}>
            Create Map Game
          </Link>
        </section>
      ) : null}
    </main>
  );
}
