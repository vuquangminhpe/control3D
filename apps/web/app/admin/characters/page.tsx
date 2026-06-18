import { AdminCharactersClient } from "@/components/admin/AdminCharactersClient";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";

export default function AdminCharactersPage() {
  return (
    <AdminRouteGuard>
      <AdminCharactersClient />
    </AdminRouteGuard>
  );
}
