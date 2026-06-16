import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth/AuthForms";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="user-login" />
      <p className="auth-switch">
        New player? <Link href={"/register" as Route}>Create an account</Link>
      </p>
    </main>
  );
}
