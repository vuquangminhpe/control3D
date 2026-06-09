"use client";

import { useGameStore } from "@/store/gameStore";

export function HUD() {
  const score = useGameStore((state) => state.score);
  const level = useGameStore((state) => state.level);
  const xp = useGameStore((state) => state.xp);
  const nextLevelXp = useGameStore((state) => state.nextLevelXp);
  
  const playerHp = useGameStore((state) => state.playerHp);
  const playerMaxHp = useGameStore((state) => state.playerMaxHp);
  const comboCount = useGameStore((state) => state.comboCount);
  const status = useGameStore((state) => state.status);
  const startGame = useGameStore((state) => state.startGame);
  
  const hpPercent = Math.max((playerHp / playerMaxHp) * 100, 0);
  const xpPercent = Math.max((xp / nextLevelXp) * 100, 0);

  return (
    <div className="hud-container">
      {/* 1. Top Panel: Stats */}
      <div className="hud-top-panel">
        {/* HP Bar */}
        <div className="hud-stat-group hp">
          <div className="stat-label-row">
            <span>HEALTH POINTS</span>
            <span>{playerHp} / {playerMaxHp}</span>
          </div>
          <div className="hud-bar-bg">
            <div className="hud-bar-fill hp" style={{ width: `${hpPercent}%` }} />
          </div>
        </div>

        {/* XP Bar & Level */}
        <div className="hud-stat-group xp">
          <div className="stat-label-row">
            <span>LEVEL {level}</span>
            <span>{xp} / {nextLevelXp} XP</span>
          </div>
          <div className="hud-bar-bg">
            <div className="hud-bar-fill xp" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>

        {/* Score Card */}
        <div className="hud-score-card">
          <span>SCORE</span>
          <strong>{score}</strong>
        </div>
      </div>

      {/* 2. Combo Indicator */}
      {comboCount > 0 && (
        <div className={`combo-meter combo-${comboCount}`}>
          <div className="combo-count">COMBO x{comboCount}</div>
          <div className="combo-text">
            {comboCount === 1 && "LIGHT ATTACK"}
            {comboCount === 2 && "HEAVY SWEEP"}
            {comboCount === 3 && "FINISHER CRUSH!"}
          </div>
        </div>
      )}

      {/* 3. Controls Manual (Floating Sidebar) */}
      <div className="controls-sidebar">
        <h4>COMMAND MANUAL</h4>
        <div className="control-item">
          <span className="key">W</span>
          <span className="key">A</span>
          <span className="key">S</span>
          <span className="key">D</span>
          <span>Move Character</span>
        </div>
        <div className="control-item">
          <span className="key mouse-l">Click</span>
          <span>Target Destination</span>
        </div>
        <div className="control-item">
          <span className="key">J</span>
          <span className="key">Space</span>
          <span>Light Slash / Combo</span>
        </div>
        <div className="control-item">
          <span className="key">K</span>
          <span>Heavy Kick (Finisher)</span>
        </div>
        <div className="control-item">
          <span className="key">Shift</span>
          <span>Shield Block (-75% Dmg)</span>
        </div>
        <div className="control-item">
          <span className="key">E</span>
          <span>Interact with Robot BOT</span>
        </div>
      </div>

      {/* 4. Game Status Screens (Defeat, Victory) */}
      {status === "game_over" && (
        <div className="game-status-screen defeat">
          <div className="status-box">
            <h2>MISSION FAILED</h2>
            <p>Your cybernetic systems were compromised by the infected horde.</p>
            <div className="stats-row">
              <div>Level reached: <strong>{level}</strong></div>
              <div>Final Score: <strong>{score}</strong></div>
            </div>
            <button className="hud-action-button" onClick={startGame}>
              RESPAWN PLAYER
            </button>
          </div>
        </div>
      )}

      {status === "victory" && (
        <div className="game-status-screen victory">
          <div className="status-box">
            <h2>SECTOR SECURED</h2>
            <p>You have purged all infected anomalies from the western sector.</p>
            <div className="stats-row">
              <div>Level reached: <strong>{level}</strong></div>
              <div>Final Score: <strong>{score}</strong></div>
            </div>
            <button className="hud-action-button victory" onClick={startGame}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
