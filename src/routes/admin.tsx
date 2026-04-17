import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/pages/Admin";
import { AdminRoute } from "@/features/admin/routes/adminRoute";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <AdminRoute>
      <Admin />
    </AdminRoute>
  );
}
