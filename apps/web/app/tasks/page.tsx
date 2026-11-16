"use client";
import { useEffect, useState } from "react";
import { Shell, api } from "../components/Shell";
import { loadAllClients } from "../lib/load-clients";
type Task = {
  id: string;
  title: string;
  status: number;
  dueDate: number | null;
  fee: number;
  notes: string | null;
  clientId: string;
  clientName: string;
  assigneeId: string;
  assigneeName: string;
  createdOn: number;
};
export default function Tasks() {
  const [data, setData] = useState<Task[]>([]),
    [clients, setClients] = useState<any[]>([]),
    [staff, setStaff] = useState<any[]>([]),
    [me, setMe] = useState<any>(null),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [statuses, setStatuses] = useState<string[]>([]),
    [clientId, setClientId] = useState(""),
    [assigneeId, setAssigneeId] = useState(""),
    [dueFrom, setDueFrom] = useState(""),
    [dueTo, setDueTo] = useState(""),
    [sort, setSort] = useState("createdOn"),
    [order, setOrder] = useState("desc"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [edit, setEdit] = useState<Task | null>(null),
    [modal, setModal] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: "25",
        sort,
        order,
      });
      if (q.trim()) qs.set("q", q.trim());
      statuses.forEach((s) => qs.append("status", s));
      if (clientId) qs.set("clientId", clientId);
      if (assigneeId) qs.set("assigneeId", assigneeId);
      if (dueFrom)
        qs.set("dueFrom", String(new Date(`${dueFrom}T00:00:00`).getTime()));
      if (dueTo)
        qs.set("dueTo", String(new Date(`${dueTo}T23:59:59.999`).getTime()));
      const r = await api(`tasks?${qs}`);
      setData(r.data);
      setTotal(r.total);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    loadAllClients(api)
      .then(setClients)
      .catch(() => {});
    api("me")
      .then(setMe)
      .catch(() => {});
    api("staff")
      .then((r) => setStaff(r.data))
      .catch(() => {});
  }, [page, statuses, clientId, assigneeId, dueFrom, dueTo, sort, order]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (edit) {
        const patch =
          me?.role === "employee"
            ? { status: Number(d.status), notes: d.notes || null }
            : {
                ...d,
                status: Number(d.status),
                fee: Number(d.fee),
                dueDate: d.dueDate
                  ? new Date(String(d.dueDate) + "T00:00:00").getTime()
                  : null,
              };
        await api(`tasks/${edit.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } else
        await api("tasks", {
          method: "POST",
          body: JSON.stringify({
            ...d,
            status: Number(d.status),
            fee: Number(d.fee || 0),
            dueDate: d.dueDate
              ? new Date(String(d.dueDate) + "T00:00:00").getTime()
              : undefined,
          }),
        });
      setModal(false);
      setEdit(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    try {
      await api(`tasks/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  function toggleStatus(value: string) {
    setPage(1);
    setStatuses((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }
  function resetFilters() {
    setQ("");
    setStatuses([]);
    setClientId("");
    setAssigneeId("");
    setDueFrom("");
    setDueTo("");
    setSort("createdOn");
    setOrder("desc");
    setPage(1);
  }
  const statusName = ["Open", "In progress", "Done"];
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Work management</span>
          <h1>Tasks</h1>
          <p>Track client work, owners, due dates and progress.</p>
        </div>
        {me?.role === "admin" && (
          <button
            className="primary-button"
            onClick={() => {
              setEdit(null);
              setModal(true);
            }}
          >
            ＋ Create task
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="surface-card task-filter-card">
        <div className="task-filter-top">
          <label className="search-field">
            <input
              aria-label="Search tasks"
              placeholder="Search title or client"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </label>
          <select
            className="control"
            aria-label="Filter client"
            value={clientId}
            onChange={(e) => {
              setPage(1);
              setClientId(e.target.value);
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {me?.role === "admin" && (
            <select
              className="control"
              aria-label="Filter assignee"
              value={assigneeId}
              onChange={(e) => {
                setPage(1);
                setAssigneeId(e.target.value);
              }}
            >
              <option value="">All assignees</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="control"
            aria-label="Sort tasks by"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="createdOn">Created date</option>
            <option value="title">Title</option>
            <option value="dueDate">Due date</option>
            <option value="status">Status</option>
            <option value="clientName">Client</option>
          </select>
          <select
            className="control sort-order"
            aria-label="Sort order"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <button className="secondary-button" onClick={() => load()}>
            Apply
          </button>
        </div>
        <div className="task-filter-bottom">
          <fieldset className="status-filters">
            <legend>Status</legend>
            {[
              ["0", "Open"],
              ["1", "In progress"],
              ["2", "Done"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={statuses.includes(value)}
                  onChange={() => toggleStatus(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="date-filter">
            Due from
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => {
                setPage(1);
                setDueFrom(e.target.value);
              }}
            />
          </label>
          <label className="date-filter">
            Due to
            <input
              type="date"
              value={dueTo}
              onChange={(e) => {
                setPage(1);
                setDueTo(e.target.value);
              }}
            />
          </label>
          <button className="filter-reset" onClick={resetFilters}>
            Clear filters
          </button>
          <span className="filter-count">
            {total} task{total === 1 ? "" : "s"}
          </span>
        </div>
      </section>
      <section className="surface-card task-results">
        {loading ? (
          <div className="loading">Loading tasks…</div>
        ) : data.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▦</div>
            <h3>No tasks found</h3>
            <p>
              {q ||
              statuses.length ||
              clientId ||
              assigneeId ||
              dueFrom ||
              dueTo
                ? "Adjust your filters or search terms."
                : "Create a task to start tracking client work."}
            </p>
            {me?.role === "admin" && !q && (
              <button
                className="primary-button"
                onClick={() => {
                  setEdit(null);
                  setModal(true);
                }}
              >
                Create task
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Client</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Fee</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="row-title">{t.title}</div>
                        {t.notes && (
                          <div className="secondary-text">{t.notes}</div>
                        )}
                      </td>
                      <td>{t.clientName}</td>
                      <td>
                        <div className="avatar-cell">
                          <span className="mini-avatar">
                            {t.assigneeName?.slice(0, 1).toUpperCase()}
                          </span>
                          {t.assigneeName}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${t.status === 2 ? "status-done" : t.status === 1 ? "status-progress" : "status-open"}`}
                        >
                          {statusName[t.status]}
                        </span>
                      </td>
                      <td>
                        {t.dueDate
                          ? new Date(Number(t.dueDate)).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>{Number(t.fee).toFixed(2)}</td>
                      <td>
                        <button
                          className="table-action"
                          onClick={() => {
                            setEdit(t);
                            setModal(true);
                          }}
                        >
                          {me?.role === "admin" ? "Edit" : "Update"}
                        </button>
                        {me?.role === "admin" && (
                          <button
                            className="table-action"
                            onClick={() => remove(t.id)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of{" "}
                {total} tasks
              </span>
              <div className="pager">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <button
                  disabled={page * 25 >= total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && (setModal(false), setEdit(null))
          }
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="task-modal-title">
                  {edit
                    ? me?.role === "employee"
                      ? "Update task"
                      : "Edit task"
                    : "Create task"}
                </h2>
                <p>
                  {edit
                    ? "Update this task and save your changes."
                    : "Add a piece of work for a client."}
                </p>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => {
                  setModal(false);
                  setEdit(null);
                }}
              >
                ×
              </button>
            </div>
            <form key={edit?.id ?? "new"} onSubmit={save}>
              <div className="form-grid">
                {me?.role === "admin" && (
                  <label className="form-field">
                    Client
                    <select
                      name="clientId"
                      defaultValue={edit?.clientId ?? ""}
                      required
                    >
                      <option value="" disabled>
                        Select a client
                      </option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="form-field">
                  Title
                  <input
                    name="title"
                    defaultValue={edit?.title ?? ""}
                    required
                    readOnly={me?.role === "employee"}
                  />
                </label>
                <label className="form-field">
                  Status
                  <select name="status" defaultValue={edit?.status ?? 0}>
                    <option value="0">Open</option>
                    <option value="1">In progress</option>
                    <option value="2">Done</option>
                  </select>
                </label>
                {me?.role === "admin" && (
                  <label className="form-field">
                    Assignee
                    <select
                      name="assigneeId"
                      defaultValue={edit?.assigneeId ?? me?.userId ?? ""}
                      required
                    >
                      {staff.map((s) => (
                        <option key={s.userId} value={s.userId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {me?.role === "admin" && (
                  <label className="form-field">
                    Due date
                    <input
                      name="dueDate"
                      type="date"
                      defaultValue={
                        edit?.dueDate
                          ? new Date(Number(edit.dueDate))
                              .toISOString()
                              .slice(0, 10)
                          : ""
                      }
                    />
                  </label>
                )}
                {me?.role === "admin" && (
                  <label className="form-field">
                    Fee
                    <input
                      name="fee"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={edit?.fee ?? 0}
                    />
                  </label>
                )}
                <label className="form-field full">
                  Notes
                  <textarea name="notes" defaultValue={edit?.notes ?? ""} />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setModal(false);
                    setEdit(null);
                  }}
                >
                  Cancel
                </button>
                <button className="primary-button">
                  {edit ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}
