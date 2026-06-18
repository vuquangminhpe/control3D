import "@/components/game/game.css";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";
import { GameWorkbench } from "@/components/game/GameWorkbench";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminMapPreviewPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="game-settings-page">
      <AdminRouteGuard>
        <GameWorkbench adminPreview initialMapId={id} />
      </AdminRouteGuard>
    </main>
  );
}
