"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { registerAction } from "@/app/actions";

export default function RegisterPage() {
  const [state, formAction] = useFormState(registerAction, null);

  return (
    <main className="auth-page">
      <section className="auth-box">
        <span className="eyebrow">LT Training Center</span>
        <h1>Crear cuenta</h1>
        <p className="muted">Registrate para participar del prode.</p>
        {state?.error ? <div className="error">{state.error}</div> : null}
        <form action={formAction} className="stack">
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <button className="button full" type="submit">
            Registrarme
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Ya tenes cuenta? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
