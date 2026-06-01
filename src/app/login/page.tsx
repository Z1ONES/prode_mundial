"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { loginAction } from "@/app/actions";

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, null);

  return (
    <main className="auth-page">
      <section className="auth-box">
        <h1>Entrar al prode</h1>
        <p className="muted">Usa tu email y password para cargar tus pronosticos.</p>
        {state?.error ? <div className="error">{state.error}</div> : null}
        <form action={formAction} className="stack">
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
              autoComplete="current-password"
              required
            />
          </div>
          <button className="button full" type="submit">
            Entrar
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          ¿No tenes cuenta? <Link href="/register">Registrate</Link>
        </p>
      </section>
    </main>
  );
}
