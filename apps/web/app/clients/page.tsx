"use client";
import { useEffect, useState } from "react";
import { Shell, api } from "../components/Shell";
export default function Clients() {
  const [rows, setRows] = useState<any[]>([]),
    [me, setMe] = useState<any>(null),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [open, setOpen] = useState(false);
  async function load(requestedPage = page) {
    setLoading(true);
    try {
      const r = await api(
        `clients?q=${encodeURIComponent(q)}&page=${requestedPage}&limit=25`,
      );
      setRows(r.data);
      setTotal(r.total);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(page);
    api("me")
      .then(setMe)
      .catch(() => {});
  }, [page]);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d: Record<string, FormDataEntryValue> = Object.fromEntries(
        new FormData(form),
      );
    if (!d.email) delete d.email;
    try {
      await api("clients", { method: "POST", body: JSON.stringify(d) });
      form.reset();
      setOpen(false);
      if (page === 1) await load(1);
      else setPage(1);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Directory</span>
          <h1>Clients</h1>
          <p>Client records used to organize firm tasks.</p>
        </div>
        {me?.role === "admin" && (
          <button className="primary-button" onClick={() => setOpen(true)}>
            ＋ Add client
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="search-field">
            <input
              aria-label="Search clients"
              placeholder="Search by client name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (page === 1) void load(1);
                else setPage(1);
              }}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              if (page === 1) void load(1);
              else setPage(1);
            }}
          >
            Search
          </button>
        </div>
        <span className="secondary-text">
          {total} client{total === 1 ? "" : "s"}
        </span>
      </div>
      <section className="surface-card">
        {loading ? (
          <div className="loading">Loading clients…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <h3>No clients found</h3>
            <p>
              {q
                ? "Try a different search, or clear the search field."
                : "Add a client to begin creating tasks."}
            </p>
            {me?.role === "admin" && !q && (
              <button className="primary-button" onClick={() => setOpen(true)}>
                Add your first client
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="row-title">{c.name}</span>
                    </td>
                    <td className="client-email">{c.email || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <div className="table-footer">
            <span>
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total} clients
            </span>
            <div className="pager">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      {open && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-modal-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="client-modal-title">Add client</h2>
                <p>Create a client record for this firm.</p>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={create}>
              <label className="form-field">
                Client name
                <input
                  name="name"
                  placeholder="e.g. Northwind Studio"
                  required
                  autoFocus
                />
              </label>
              <label className="form-field" style={{ marginTop: 14 }}>
                Email address <span className="secondary-text">Optional</span>
                <input
                  name="email"
                  type="email"
                  placeholder="contact@example.com"
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button className="primary-button">Save client</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
