import { AdminMapsClient } from "@/components/admin/AdminMapsClient";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";

export default function AdminMapsPage() {
  return (
    <AdminRouteGuard>
      <AdminMapsClient />
    </AdminRouteGuard>
  );
}
