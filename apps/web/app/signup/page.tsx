"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyFieldErrors } from "../components/Shell";
export default function Signup() {
  const [error, setError] = useState(""),
    router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = Object.fromEntries(new FormData(form));
    const r = await fetch("/api/firms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      const result = await r.json().catch(() => ({}));
      applyFieldErrors(result.fields, form);
      setError(
        r.status === 409
          ? "This email already has an account."
          : r.status === 400
            ? "Please correct the highlighted field(s)."
            : "Please check the form and try again.",
      );
      return;
    }
    const login = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: d.email, password: d.password }),
    });
    if (login.ok) router.push("/tasks");
    else router.push("/login");
  }
  return (
    <main className="content-area login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">T</span>
          <span>taskdesk</span>
        </div>
        <span className="eyebrow">Get started</span>
        <h1 style={{ marginTop: 6, marginBottom: 22 }}>Create your firm</h1>
        <form onSubmit={submit}>
          <label>
            Firm name
            <input name="firmName" required placeholder="Your firm name" />
          </label>
          <label>
            Your name
            <input name="name" required placeholder="Full name" />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button">Create firm</button>
        </form>
      </section>
    </main>
  );
};