"use client";

import "@/components/game/game.css";
import { GameWorkbench } from "@/components/game/GameWorkbench";

export default function GamePage() {
  return (
    <main className="game-settings-page">
      <GameWorkbench />
    </main>
  );
}
