ALTER TABLE firms ADD COLUMN IF NOT EXISTS parent_firm_id text REFERENCES firms(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS firms_parent_idx ON firms(parent_firm_id);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_firm_id_assignee_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_user_fkey FOREIGN KEY (assignee_id) REFERENCES users(id);

CREATE TABLE IF NOT EXISTS firm_invites (
  id text PRIMARY KEY,
  firm_id text NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','employee')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firm_invites_firm_idx ON firm_invites(firm_id,email);
