import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth/AuthForms";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <AuthForm mode="user-register" />
      <p className="auth-switch">
        Already registered? <Link href={"/login" as Route}>Login</Link>
      </p>
    </main>
  );
}
