CREATE TABLE browser_identities (
  user_id uuid PRIMARY KEY REFERENCES users,
  provider text NOT NULL CHECK (provider = 'clerk'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  UNIQUE (provider, subject)
);

ALTER TABLE memberships DROP CONSTRAINT memberships_pkey;
ALTER TABLE memberships ADD PRIMARY KEY (user_id, workspace_id);
CREATE UNIQUE INDEX one_active_workspace_per_user ON memberships (user_id) WHERE active;
ALTER TABLE memberships ADD COLUMN role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member'));
