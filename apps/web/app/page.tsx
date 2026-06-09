"use client";

import "@/components/game/game.css";
import { GameCanvas } from "@/components/game/GameCanvas";
import { HUD } from "@/components/game/HUD";
import { DialogueSystem } from "@/components/game/DialogueSystem";

export default function GamePage() {
  return (
    <main style={{ padding: 0, margin: 0, maxWidth: "none" }}>
      <div className="game-container">
        {/* Main 3D Scene */}
        <GameCanvas />

        {/* HUD Overlay (HP, XP, Combo, Guide) */}
        <HUD />

        {/* dialogue screen overlay for BOT interaction */}
        <DialogueSystem />
      </div>
    </main>
  );
}
