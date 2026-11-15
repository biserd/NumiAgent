CREATE TABLE developer_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope = 'collection:read'),
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX developer_keys_owner ON developer_keys(user_id, expires);
CREATE INDEX developer_keys_expiry ON developer_keys(expires);
