CREATE TABLE machine_enrollment_codes (
  digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users,
  workspace_id uuid NOT NULL REFERENCES workspaces,
  purpose text NOT NULL CHECK (purpose = 'machine-enrollment'),
  redirect_uri text NOT NULL,
  challenge text NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  scope text NOT NULL CHECK (scope = 'telemetry:write machine:self'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE machine_refresh_credentials (
  digest text PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
ALTER TABLE machine_credentials DROP CONSTRAINT machine_credentials_audience_check;
ALTER TABLE machine_credentials ADD CONSTRAINT machine_credentials_audience_check
  CHECK (audience IN ('telemetry:ingest', 'machine:access'));
ALTER TABLE machines ADD COLUMN installation_id uuid;
ALTER TABLE machines ADD COLUMN display_name text;
CREATE UNIQUE INDEX one_active_machine_per_installation ON machines (installation_id) WHERE active AND installation_id IS NOT NULL;

CREATE TABLE machine_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces,
  actor_type text NOT NULL CHECK (actor_type = 'user'),
  actor_id uuid NOT NULL REFERENCES users,
  action text NOT NULL CHECK (action = 'machine.registered'),
  target_machine_id uuid NOT NULL REFERENCES machines,
  result text NOT NULL CHECK (result = 'success'),
  request_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION forbid_machine_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_audit'; END;
$$;
CREATE TRIGGER immutable_machine_audit BEFORE UPDATE OR DELETE ON machine_audit
  FOR EACH ROW EXECUTE FUNCTION forbid_machine_audit_change();
