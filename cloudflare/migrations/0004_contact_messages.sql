CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX contact_messages_created ON contact_messages(created);
