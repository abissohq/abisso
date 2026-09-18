CREATE TABLE browser_sessions (
  digest text PRIMARY KEY,
  user_id uuid REFERENCES users,
  csrf_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE browser_login_codes (
  digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users,
  purpose text NOT NULL CHECK (purpose = 'browser-login'),
  session_digest text NOT NULL REFERENCES browser_sessions,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE workspace_projection_revisions (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces,
  revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE workstream_projection (
  workspace_id uuid NOT NULL REFERENCES workspaces,
  id uuid NOT NULL,
  revision bigint NOT NULL,
  ledger_watermark bigint NOT NULL REFERENCES canonical_event_ledger,
  data jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE TABLE session_projection (
  workspace_id uuid NOT NULL REFERENCES workspaces,
  id text NOT NULL,
  workstream_id uuid NOT NULL,
  revision bigint NOT NULL,
  ledger_watermark bigint NOT NULL REFERENCES canonical_event_ledger,
  data jsonb NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, workstream_id) REFERENCES workstream_projection (workspace_id, id)
);
