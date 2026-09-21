ALTER TABLE machine_refresh_credentials ADD COLUMN family_id uuid;
UPDATE machine_refresh_credentials SET family_id = machine_id;
ALTER TABLE machine_refresh_credentials ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE machine_refresh_credentials ADD COLUMN generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0);
ALTER TABLE machine_refresh_credentials ADD COLUMN consumed_at timestamptz;
ALTER TABLE machine_refresh_credentials ADD COLUMN retry_expires_at timestamptz;
ALTER TABLE machine_refresh_credentials ADD COLUMN retry_installation_id uuid;
ALTER TABLE machine_refresh_credentials ADD COLUMN retry_request_id uuid;
ALTER TABLE machine_refresh_credentials ADD COLUMN retry_request_digest text;
ALTER TABLE machine_refresh_credentials ADD CONSTRAINT one_refresh_generation_per_family UNIQUE (family_id, generation);
ALTER TABLE machine_refresh_credentials ADD CONSTRAINT keyed_refresh_digest CHECK (digest ~ '^[0-9a-f]{64}$');
ALTER TABLE machine_refresh_credentials ADD CONSTRAINT complete_refresh_retry_metadata CHECK (
  (consumed_at IS NULL AND retry_expires_at IS NULL AND retry_installation_id IS NULL
    AND retry_request_id IS NULL AND retry_request_digest IS NULL)
  OR
  (consumed_at IS NOT NULL AND retry_expires_at IS NOT NULL AND retry_installation_id IS NOT NULL
    AND retry_request_id IS NOT NULL AND retry_request_digest IS NOT NULL)
);

-- This domain-separated marker is not an active credential verifier. It retains
-- only enough keyed information to map a late reused bearer to its family after
-- the predecessor credential and its retry metadata have been removed.
CREATE TABLE machine_refresh_reuse_markers (
  marker text PRIMARY KEY CHECK (marker ~ '^[0-9a-f]{64}$'),
  family_id uuid NOT NULL,
  machine_id uuid NOT NULL REFERENCES machines,
  generation integer NOT NULL CHECK (generation >= 0),
  UNIQUE (family_id, generation)
);
CREATE INDEX refresh_reuse_marker_family ON machine_refresh_reuse_markers (family_id);

CREATE TABLE machine_credential_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces,
  machine_id uuid NOT NULL REFERENCES machines,
  action text NOT NULL CHECK (action IN ('machine.refresh_rotated', 'machine.refresh_family_revoked')),
  reason text NOT NULL CHECK (reason IN ('authorized_refresh', 'credential_expired', 'credential_reuse', 'inactive_authority')),
  audit_id uuid NOT NULL,
  presented_request_id uuid,
  generation integer NOT NULL CHECK (generation >= 0),
  recorded_at timestamptz NOT NULL
);
CREATE FUNCTION forbid_machine_credential_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_audit'; END;
$$;
CREATE TRIGGER immutable_machine_credential_audit BEFORE UPDATE OR DELETE ON machine_credential_audit
  FOR EACH ROW EXECUTE FUNCTION forbid_machine_credential_audit_change();
