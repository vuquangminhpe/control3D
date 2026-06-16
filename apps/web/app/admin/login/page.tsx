import { AuthForm } from "@/components/auth/AuthForms";

export default function AdminLoginPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="admin-login" />
    </main>
  );
}
