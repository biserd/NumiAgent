CREATE TABLE launch_waitlist (
  email TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  requested_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
