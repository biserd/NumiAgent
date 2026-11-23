CREATE TABLE gap_watches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  query TEXT NOT NULL,
  alert INTEGER NOT NULL DEFAULT 0,
  seen TEXT NOT NULL DEFAULT '[]',
  checked INTEGER,
  UNIQUE(user_id, theme_id, slot_key)
);
CREATE INDEX gap_watches_due ON gap_watches(alert, checked);
