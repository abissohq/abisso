CREATE TABLE workspaces (id uuid PRIMARY KEY, active boolean NOT NULL);
CREATE TABLE users (id uuid PRIMARY KEY, active boolean NOT NULL);
CREATE TABLE memberships (
  user_id uuid PRIMARY KEY REFERENCES users,
  workspace_id uuid NOT NULL REFERENCES workspaces,
  active boolean NOT NULL,
  UNIQUE (workspace_id, user_id)
);
CREATE TABLE machines (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  active boolean NOT NULL,
  FOREIGN KEY (workspace_id, user_id) REFERENCES memberships (workspace_id, user_id),
  UNIQUE (id, workspace_id, user_id)
);
CREATE TABLE sources (
  id uuid PRIMARY KEY,
  machine_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  adapter_name text NOT NULL,
  active boolean NOT NULL,
  FOREIGN KEY (machine_id, workspace_id, user_id) REFERENCES machines (id, workspace_id, user_id),
  UNIQUE (id, workspace_id)
);
CREATE TABLE workspace_policies (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces,
  version text NOT NULL,
  operational_metadata_allowed boolean NOT NULL
);
CREATE TABLE collection_consents (
  machine_id uuid PRIMARY KEY REFERENCES machines,
  policy_version text NOT NULL,
  active boolean NOT NULL
);
CREATE TABLE machine_configuration (
  machine_id uuid PRIMARY KEY REFERENCES machines,
  policy_version text NOT NULL,
  collection_state text NOT NULL CHECK (collection_state IN ('active', 'paused'))
);
CREATE TABLE machine_credentials (
  digest text PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES machines,
  audience text NOT NULL CHECK (audience = 'telemetry:ingest'),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE telemetry_batch_requests (
  machine_id uuid NOT NULL REFERENCES machines,
  request_id uuid NOT NULL,
  digest text NOT NULL,
  response text NOT NULL,
  source_ids uuid[] NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (machine_id, request_id)
);
CREATE TABLE canonical_event_ledger (
  ledger_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  machine_id uuid NOT NULL,
  source_id uuid NOT NULL,
  stream_id text NOT NULL,
  source_sequence bigint NOT NULL CHECK (source_sequence >= 1 AND source_sequence <= 9007199254740991),
  event_id text NOT NULL,
  schema_version text NOT NULL,
  event_kind text NOT NULL,
  session_id text,
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  FOREIGN KEY (source_id, workspace_id) REFERENCES sources (id, workspace_id),
  FOREIGN KEY (machine_id, workspace_id, user_id) REFERENCES machines (id, workspace_id, user_id),
  UNIQUE (workspace_id, source_id, event_id)
);
CREATE FUNCTION forbid_ledger_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_ledger'; END;
$$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE ON canonical_event_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_update();
CREATE TABLE telemetry_event_dispositions (
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  event_id text NOT NULL,
  digest text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('accepted', 'rejected')),
  reason_code text,
  ledger_id bigint REFERENCES canonical_event_ledger,
  stream_id text,
  source_sequence bigint,
  finalized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, source_id, event_id),
  FOREIGN KEY (source_id, workspace_id) REFERENCES sources (id, workspace_id),
  CHECK ((disposition = 'accepted') = (ledger_id IS NOT NULL))
);
CREATE INDEX durable_sequences ON telemetry_event_dispositions (source_id, stream_id, source_sequence);
CREATE TABLE source_checkpoints (
  source_id uuid NOT NULL REFERENCES sources,
  stream_id text NOT NULL,
  highest_durable_sequence bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, stream_id)
);
CREATE TABLE projection_jobs (
  ledger_id bigint PRIMARY KEY REFERENCES canonical_event_ledger,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at timestamptz
);
CREATE TABLE active_capability_declarations (
  source_id uuid PRIMARY KEY REFERENCES sources,
  declaration_id text NOT NULL,
  ledger_id bigint NOT NULL UNIQUE REFERENCES canonical_event_ledger,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz
);
CREATE TABLE source_capability_projection (
  source_id uuid PRIMARY KEY REFERENCES sources,
  declaration_id text NOT NULL,
  ledger_id bigint NOT NULL REFERENCES canonical_event_ledger,
  projector_version text NOT NULL
);
CREATE TABLE ingestion_security_signals (
  machine_id uuid NOT NULL REFERENCES machines,
  reason_code text NOT NULL CHECK (reason_code IN ('event_id_collision', 'request_id_collision')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
