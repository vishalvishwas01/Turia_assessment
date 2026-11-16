"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
type Firm = {
  firmId: string;
  name: string;
  parentFirmId: string | null;
  role: string;
};
type Me = {
  name: string;
  firmName: string;
  firmId: string;
  role: string;
  firms: Firm[];
};
export function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null),
    [firms, setFirms] = useState<Firm[]>([]),
    [switching, setSwitching] = useState(false),
    router = useRouter(),
    path = usePathname();
  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (data?.firms) setFirms(data.firms);
        if (ok) setMe(data);
      });
  }, []);
  async function changeFirm(firmId: string) {
    if (!firmId || firmId === me?.firmId) return;
    setSwitching(true);
    const r = await fetch(
      `/api/me?organizationId=${encodeURIComponent(firmId)}`,
      { cache: "no-store" },
    );
    if (r.ok) {
      window.location.reload();
      return;
    }
    setSwitching(false);
  }
  async function signout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  const items = [
    { href: "/tasks", label: "Tasks", icon: "▦" },
    { href: "/clients", label: "Clients", icon: "◉" },
    ...(me?.role === "admin"
      ? [{ href: "/staff", label: "Staff", icon: "♙" }]
      : []),
  ];
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/tasks">
          <span className="brand-mark">T</span>
          <span>
            taskdesk<small>WORKSPACE</small>
          </span>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {items.map((item) => (
            <Link
              key={item.href}
              className={path === item.href ? "nav-item active" : "nav-item"}
              href={item.href}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {path === item.href && <span className="nav-current" />}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">
              {items.find((i) => i.href === path)?.label ?? "Workspace"}
            </span>
            <span className="topbar-divider">/</span>
            {firms.length > 0 ? (
              <select
                aria-label="Select firm"
                className="firm-switcher"
                value={me?.firmId ?? ""}
                disabled={switching}
                onChange={(e) => void changeFirm(e.target.value)}
              >
                <option value="" disabled>
                  Select firm
                </option>
                {firms.map((f) => (
                  <option key={f.firmId} value={f.firmId}>
                    {f.name}
                    {f.parentFirmId ? " (Branch)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="topbar-firm">{me?.firmName ?? "Taskdesk"}</span>
            )}
          </div>
          <div className="topbar-user">
            <span className="user-avatar">
              {me?.name?.slice(0, 1).toUpperCase() ?? "…"}
            </span>
            <span>
              <strong>{me?.name ?? "Loading"}</strong>
              <small>{me?.role ?? ""}</small>
            </span>
            <button className="text-button" onClick={signout}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
export function applyFieldErrors(
  fields: Record<string, string[]> | undefined,
  form?: HTMLFormElement,
) {
  if (!fields || typeof document === "undefined") return;
  for (const [name, messages] of Object.entries(fields)) {
    const field = Array.from(
      (form ?? document).querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input[name],textarea[name],select[name]"),
    ).find((item) => item.name === name);
    if (field && messages?.[0]) {
      field.setCustomValidity(messages[0]);
      field.addEventListener("input", () => field.setCustomValidity(""), {
        once: true,
      });
      field.addEventListener("change", () => field.setCustomValidity(""), {
        once: true,
      });
      field.reportValidity();
    }
  }
}
export async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  let data: any;
  try {
    data = await r.json();
  } catch {}
  if (!r.ok) {
    const fields = data?.fields as Record<string, string[]> | undefined;
    applyFieldErrors(fields);
    let message = data?.error ?? `Request failed (${r.status})`;
    if (fields) message = "Please correct the highlighted field(s).";
    else if (r.status === 401)
      message = "Your session has ended. Please sign in again.";
    else if (r.status === 403)
      message = "You are signed in, but your role does not allow this action.";
    else if (r.status === 404)
      message = "This record was not found or is not visible to you.";
    else if (r.status === 409)
      message = data?.error ?? "This conflicts with an existing record.";
    else if (r.status === 429)
      message = "Too many attempts. Please try again later.";
    throw Object.assign(new Error(message), { status: r.status, fields });
  }
  return data;
}
export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="error">
      {message}
    </p>
  );
}
