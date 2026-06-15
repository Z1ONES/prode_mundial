"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions";

type PasswordLookupState = {
  error?: string;
  email?: string;
  name?: string;
} | null;

type PasswordResetState = {
  error?: string;
} | null;

export default function ForgotPasswordPage() {
  const [lookupState, lookupAction] = useFormState(
    requestPasswordResetAction,
    null as PasswordLookupState
  );
  const [resetState, resetAction] = useFormState(resetPasswordAction, null as PasswordResetState);
  const verifiedEmail = lookupState?.email;

  return (
    <main className="auth-page">
      <section className="auth-box">
        <span className="eyebrow">Recuperar acceso</span>
        <h1>Cambiar password</h1>
        <p className="muted">
          Ingresa tu email. Si existe una cuenta, vas a poder definir una password nueva.
        </p>

        {!verifiedEmail ? (
          <form action={lookupAction} className="stack" style={{ marginTop: 16 }}>
            {lookupState?.error ? <div className="error">{lookupState.error}</div> : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <button className="button full" type="submit">
              Validar usuario
            </button>
          </form>
        ) : (
          <form action={resetAction} className="stack" style={{ marginTop: 16 }}>
            {resetState?.error ? <div className="error">{resetState.error}</div> : null}
            <div className="success">
              Usuario encontrado: {lookupState?.name}. Elegi una password nueva.
            </div>
            <input name="email" type="hidden" value={verifiedEmail} />
            <div className="field">
              <label htmlFor="password">Nueva password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirmar password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <button className="button full" type="submit">
              Guardar nueva password
            </button>
          </form>
        )}

        <p className="muted" style={{ marginTop: 16 }}>
          Ya te acordaste? <Link href="/login">Volver al login</Link>
        </p>
      </section>
    </main>
  );
}
