# Taskdesk

Taskdesk is a back-office application for accounting firms to manage staff, clients and client tasks. It supports admin/employee roles, firm-level access controls, and Extension B for branches and users who belong to multiple firms.

## Project notes

- [Project structure, stack and file purposes](PROJECT_STRUCTURE.md)
- [Engineering approach, decisions and AI assistance](ENGINEERING_APPROACH.md)
- [Assignment-specific assumptions](NOTES.md)

## Run locally (PowerShell)

Requirements: Node.js 20+, npm, and PostgreSQL 15+.

1. From the repository root, install dependencies:

   ```powershell
   npm ci
   ```

2. Create the local environment file and edit it for your PostgreSQL setup:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `DATABASE_URL` to the runtime database account and `DATABASE_OWNER_URL` to the account that can apply migrations. Keep `.env` private and do not commit it. The example defaults use API port `4000` and web port `3000`.

3. Apply database migrations, then build both applications:

   ```powershell
   npm run migrate
   npm run build
   ```

4. Start API and web services together:

   ```powershell
   npm start
   ```

   Open `http://localhost:3000/login`. The API listens on `PORT` (default `4000`); the web app listens on `WEB_PORT` (default `3000`). Stop both with `Ctrl+C` in the terminal running `npm start`.

## Tests

Tests use a real PostgreSQL database and create/clean up their own fixtures. Configure the database environment values in the root `.env`, ensure PostgreSQL is running and the schema is migrated, then run:

```powershell
npm test
```

The test command runs API integration tests and proxy response tests. To recheck the production build:

```powershell
npm run build
```

There is no seed data; create firms and records through the application UI.
