ALTER TABLE projection_jobs
  DROP CONSTRAINT projection_jobs_status_check,
  ADD CONSTRAINT projection_jobs_status_check CHECK (status IN ('pending', 'running', 'completed', 'dead_letter')),
  ADD COLUMN owner_id uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  ADD COLUMN error_code text CHECK (error_code IN ('projection_failed', 'lease_expired')),
  ADD CONSTRAINT job_lease_shape CHECK ((status = 'running') = (owner_id IS NOT NULL AND lease_expires_at IS NOT NULL));
CREATE INDEX projection_jobs_eligible ON projection_jobs (ledger_id)
  WHERE status IN ('pending', 'running');
