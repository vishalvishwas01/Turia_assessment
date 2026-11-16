# Taskdesk - Engineering Approach

## Key engineering decisions

- **Enforce permissions in the API:** UI controls improve usability, but API checks remain authoritative so requests cannot bypass role restrictions.
- **Scope data by organization:** Resolve accessible firms from stored memberships; require an explicit organization choice when a person can access multiple firms.
- **Protect data integrity in two layers:** Validate requests in the API and use PostgreSQL constraints for important relationships and allowed values.
- **Keep session tokens out of browser JavaScript:** The same-origin web proxy handles HttpOnly session cookies and forwards requests to the API.
- **Make list behavior complete:** Paginate task results; load all client pages for task pickers so clients beyond the first page remain selectable.

## Reliability and scalability

- Added PostgreSQL-backed integration tests for roles, firm isolation, branches, invitations and task behavior.
- Added regression coverage for overlapping head-office/branch memberships, invalid assignments, client pagination and bodyless delete responses.
- Use bounded API pagination and indexes for common task filters; validate and authorize at the API boundary.
- The current client picker loads all client pages. For very large client lists, a searchable server-side picker would scale better.
- Tests and a successful production build provide useful verification, but are not a claim of load testing, exhaustive browser testing or production certification.

## My contribution and AI assistance

- **I set direction:** asked to understand the brief and design first, constrained scope to the PDF, deferred invoices, and later chose to implement Extension B.
- **I tested the running application:** ran install, migration, build and startup commands; exercised UI flows; shared real terminal errors and observed behavior to investigate.
- **I drove specific fixes:** reported setup/build issues, task editing/deletion behavior, branch-office scenarios and UI concerns; requested regression tests and verification.
- **I used Codex as a coding partner:** for code inspection, implementation assistance, troubleshooting and test-writing across the frontend, API and database.
- **Why Codex for this work:** it was available in the project workspace with direct repository context and the ability to assist across edits, terminal output, builds and tests in one iterative session. That made it practical to connect an observed failure to the relevant code and verify the change.

## Examples of engineering judgment

- **Branch assignment:** replaced a row-count assumption with separate SQL `EXISTS` checks. This allows valid overlapping memberships while still rejecting an invalid client or assignee.
- **Task deletion:** traced the apparent 500 to the web proxy constructing a response body for the API's successful `204 No Content`; preserved the bodyless response and added a regression test.
- **Client picker:** found the UI only loaded the first 25 clients; reused the existing paginated API to load every page and tested with more than 100 clients.
