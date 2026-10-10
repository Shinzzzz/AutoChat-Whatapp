"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions.js";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ padding: "0 0 16px" }}>
          <span className="dot">AC</span> AutoChat
        </div>
        <h1>Sign in</h1>
        <p className="muted small" style={{ marginBottom: 16 }}>
          AI omnichannel sales &amp; support console.
        </p>
        <form action={formAction}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error && <div className="err-text">{state.error}</div>}
          <button className="btn primary" type="submit" disabled={pending} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted small" style={{ marginTop: 16 }}>
          Seeded demo login: <code>admin@aquamedia.in</code> / <code>autochat123</code>
        </p>
      </div>
    </div>
  );
}
