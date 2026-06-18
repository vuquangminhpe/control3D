import "@/components/game/game.css";
import { GameWorkbench } from "@/components/game/GameWorkbench";

type PageProps = {
  searchParams?: Promise<{ map?: string }>;
};

export default async function GamePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};

  return (
    <main className="game-settings-page">
      <GameWorkbench initialMapId={params.map ?? null} />
    </main>
  );
}
