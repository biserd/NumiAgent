CREATE TABLE guest_scans (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  expires INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','failed','complete')),
  attempt INTEGER NOT NULL,
  started INTEGER NOT NULL,
  result TEXT
);
CREATE INDEX guest_scans_expiry ON guest_scans(expires);
