"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { applyFieldErrors } from "../components/Shell";
export default function Login() {
  const [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("session") === "ended")
      setError("Your session has ended. Please sign in again.");
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form));
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const result = await r.json().catch(() => ({}));
      applyFieldErrors(result.fields, form);
      setError(
        r.status === 429
          ? "Too many attempts. Please try again later."
          : r.status === 400
            ? "Please correct the highlighted field(s)."
            : "Invalid email or password.",
      );
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.assign(next || "/tasks");
  }
  return (
    <main className="content-area login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">T</span>
          <span>taskdesk</span>
        </div>
        <span className="eyebrow">Welcome back</span>
        <h1 style={{ marginTop: 6, marginBottom: 22 }}>Sign in</h1>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button">Sign in</button>
        </form>
        <p style={{ marginTop: 20, fontSize: 13, color: "#75857f" }}>
          Starting with Taskdesk? <Link href="/signup">Create a firm</Link>
        </p>
      </section>
    </main>
  );
}
