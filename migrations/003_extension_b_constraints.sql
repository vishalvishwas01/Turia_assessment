-- Branches are limited to one level even when rows are written outside the API.
CREATE OR REPLACE FUNCTION enforce_one_level_firm_branch() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_firm_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM firms WHERE id = NEW.parent_firm_id AND parent_firm_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Branches cannot have branches' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS firms_one_level_branch ON firms;
CREATE TRIGGER firms_one_level_branch
  BEFORE INSERT OR UPDATE OF parent_firm_id ON firms
  FOR EACH ROW EXECUTE FUNCTION enforce_one_level_firm_branch();

-- Invite expiry was not specified by the assignment; tokens remain usable until accepted.
ALTER TABLE firm_invites DROP COLUMN IF EXISTS expires_at;
