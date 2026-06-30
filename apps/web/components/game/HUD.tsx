"use client";

import { useGameStore } from "@/store/gameStore";

export function HUD() {
  const activeLevel = useGameStore((state) => state.activeLevel);
  const playerCharacter = activeLevel.playerCharacter;

  return (
    <div className="hud-container">
      <div className="hud-top-panel sandbox">
        <div className="hud-stat-group">
          <div className="stat-label-row">
            <span>MAP</span>
            <span>{activeLevel.name || "Untitled"}</span>
          </div>
          <div className="hud-bar-bg">
            <div className="hud-bar-fill xp" style={{ width: "100%" }} />
          </div>
        </div>
        <div className="hud-score-card">
          <span>PLAYER</span>
          <strong>{playerCharacter?.name ?? "None"}</strong>
        </div>
        <div className="hud-score-card">
          <span>NPC</span>
          <strong>ON MAP</strong>
        </div>
      </div>
    </div>
  );
}
