# Taskdesk - Project Structure and Stack

## Stack and coding agent

- **API:** Node.js 20+, TypeScript, Fastify, Zod validation.
- **Web application:** Next.js App Router, React, TypeScript and CSS.
- **Database:** PostgreSQL 15+, accessed with parameterized SQL through `pg`; no ORM.
- **Authentication:** opaque bearer sessions stored as hashes; Argon2id password hashing.
- **Coding agent used:** Codex, for repository-aware code assistance, troubleshooting and test-writing.
- **Scope:** required core and Extension B are included; optional Extension A (invoices) is not included.

## Repository map

```text
Taskdesk/
├── package.json                 Root commands and npm workspaces
├── package-lock.json            Locked dependency versions
├── .env                         Local settings/secrets; do not commit
├── .env.example                 Environment-variable template
├── README.md                    Short project overview and run/test commands
├── PROJECT_STRUCTURE.md         This architecture and file-purpose guide
├── ENGINEERING_APPROACH.md      Decisions, contribution and AI-use summary
├── NOTES.md                     Assignment-specific assumptions and decisions
│
├── migrations/
│   ├── 001_core.sql             Firms, users, memberships, sessions, clients, tasks
│   ├── 002_extension_b.sql      Branch and invitation schema; multi-firm support
│   └── 003_extension_b_constraints.sql
│                                Database constraint for one-level branches
│
├── scripts/
│   ├── migrate.js               Applies ordered SQL migrations and DB grants
│   ├── start.js                 Starts API and web app together
│   └── start-web.js             Starts Next.js on WEB_PORT
│
└── apps/
    ├── api/                     Fastify backend
    │   └── src/
    │       ├── server.ts        API routes, validation, auth, role checks,
    │       │                    firm scoping, tasks/clients/staff/branches/invites
    │       ├── db.ts            PostgreSQL pool and BIGINT parsing
    │       ├── migrate.ts       API workspace migration entry point
    │       ├── server.test.ts   PostgreSQL-backed API integration tests
    │       └── web-proxy.test.ts
    │                            Tests proxy behavior for bodyless delete responses
    │
    └── web/                     Next.js App Router frontend
        ├── middleware.ts        Protects pages and redirects unauthenticated users
        └── app/
            ├── api/[...path]/route.ts
            │                    Same-origin API proxy; forwards cookies/context
            ├── components/Shell.tsx
            │                    Shared shell/navigation, firm switcher, sign-out,
            │                    API helper and error handling
            ├── lib/load-clients.ts
            │                    Fetches all client pages for task pickers/filters
            ├── login/page.tsx   Sign in
            ├── signup/page.tsx  Create a firm and its first admin
            ├── tasks/page.tsx   List, filter, page, create, edit and delete tasks
            ├── clients/page.tsx Client list and admin create form
            ├── staff/page.tsx   Staff list, add staff and change roles
            ├── invite/page.tsx  Accept an invitation
            ├── page.tsx         Root route redirect
            ├── layout.tsx       Shared document layout and global stylesheet
            ├── globals.css      Application styling
            └── task-filters.css Task filter styling
```

## How the pieces connect

```text
Page component (for example tasks/page.tsx)
        │ uses
        ▼
Shared helper and shell (components/Shell.tsx)
        │ browser calls same-origin /api/*
        ▼
Next.js proxy (app/api/[...path]/route.ts)
        │ adds session/organization context; forwards request
        ▼
Fastify API (apps/api/src/server.ts)
        │ validates, authorizes and scopes query
        ▼
PostgreSQL (schema from migrations/*.sql)
```

- **Task creation:** task page submits form data → shared API helper → Next.js proxy → API validation/authorization → PostgreSQL → task returned to UI.
- **Sign-in:** login page calls the proxy → API authenticates → proxy stores the session in an HttpOnly cookie.
- **Protected pages:** web middleware checks the current session and redirects to login when invalid.
- **Firm switching:** shared shell selects an accessible firm; the proxy carries that organization context on subsequent API requests.
- **Schema setup:** `npm run migrate` runs `scripts/migrate.js`, which applies numbered SQL migration files in order.

The browser does not call the API origin directly. The API remains the authority for validation, permissions and firm-level data access; UI hiding alone is not treated as security.
