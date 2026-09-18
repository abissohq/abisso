CREATE TABLE telemetry_quarantine (
  quarantine_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  source_id uuid NOT NULL,
  extension jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (source_id, workspace_id) REFERENCES sources (id, workspace_id),
  UNIQUE (quarantine_id, workspace_id, source_id),
  CHECK (expires_at = created_at + interval '1 hour'),
  CHECK (extension IS NULL OR (
    octet_length(extension::text) <= 256 AND
    extension = '{"abisso.synthetic.m0/1":{"fixture":"quarantine","requires_interpretation":true}}'::jsonb
  ))
);
REVOKE ALL ON telemetry_quarantine FROM PUBLIC;
CREATE INDEX quarantine_expiry ON telemetry_quarantine (expires_at) WHERE extension IS NOT NULL;

ALTER TABLE telemetry_event_dispositions
  DROP CONSTRAINT telemetry_event_dispositions_disposition_check,
  ADD CONSTRAINT telemetry_event_dispositions_disposition_check
    CHECK (disposition IN ('accepted', 'rejected', 'quarantined')),
  ADD COLUMN quarantine_id uuid,
  ADD FOREIGN KEY (quarantine_id, workspace_id, source_id)
    REFERENCES telemetry_quarantine (quarantine_id, workspace_id, source_id),
  ADD CHECK ((disposition = 'quarantined') = (quarantine_id IS NOT NULL));
