CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created INTEGER NOT NULL,
  deleting INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE login_links (
  token TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  created INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX sessions_owner ON sessions(user_id);
CREATE TABLE limits (
  action TEXT NOT NULL, subject TEXT NOT NULL, window INTEGER NOT NULL,
  count INTEGER NOT NULL, PRIMARY KEY(action, subject, window)
);
CREATE TABLE collections (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  name TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(user_id, id)
);
CREATE TABLE imports (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  label TEXT NOT NULL, analyze INTEGER NOT NULL, created INTEGER NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0, UNIQUE(user_id, id)
);
CREATE TABLE photos (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  batch_id TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('uploading','queued','running','review','manual','failed','saved','cancelled')),
  created INTEGER NOT NULL, updated INTEGER NOT NULL,
  candidates TEXT, error TEXT, attempt INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, id), UNIQUE(batch_id, sha),
  FOREIGN KEY(user_id, batch_id) REFERENCES imports(user_id, id) ON DELETE CASCADE
);
CREATE INDEX photos_owner ON photos(user_id, batch_id);
CREATE INDEX photos_pending ON photos(state, updated);
CREATE TABLE items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  collection_id TEXT, type TEXT NOT NULL CHECK(type IN ('coin','banknote')),
  title TEXT NOT NULL, issuer TEXT NOT NULL DEFAULT '', ruler TEXT NOT NULL DEFAULT '',
  denomination TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL, updated INTEGER NOT NULL,
  UNIQUE(user_id, id), FOREIGN KEY (user_id, collection_id) REFERENCES collections(user_id,id)
);
CREATE INDEX items_owner ON items(user_id, created DESC, id DESC);
CREATE INDEX items_reference ON items(user_id, reference);
CREATE TABLE item_photos (
  user_id TEXT NOT NULL, item_id TEXT NOT NULL, photo_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('obverse','reverse','overview')),
  crop TEXT, PRIMARY KEY(item_id, photo_id, side),
  FOREIGN KEY(user_id,item_id) REFERENCES items(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,photo_id) REFERENCES photos(user_id,id) ON DELETE CASCADE
);
CREATE TABLE sales (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_id TEXT NOT NULL, url TEXT NOT NULL,
  date TEXT NOT NULL, currency TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0),
  basis TEXT NOT NULL CHECK(basis IN ('hammer','with_premium')), premium REAL,
  house TEXT NOT NULL, lot TEXT NOT NULL, grade TEXT NOT NULL, match TEXT NOT NULL,
  auction TEXT NOT NULL, verification TEXT NOT NULL DEFAULT 'collector_attested',
  UNIQUE(item_id, url), FOREIGN KEY(user_id,item_id) REFERENCES items(user_id,id) ON DELETE CASCADE
);
CREATE TABLE valuation_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_id TEXT NOT NULL, snapshot TEXT NOT NULL,
  created INTEGER NOT NULL, FOREIGN KEY(user_id,item_id) REFERENCES items(user_id,id) ON DELETE CASCADE
);
CREATE TABLE themes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  name TEXT NOT NULL, slots TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX themes_owner ON themes(user_id);
CREATE TABLE watchlists (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  query TEXT NOT NULL, alert INTEGER NOT NULL DEFAULT 0,
  checked INTEGER, seen TEXT NOT NULL DEFAULT '[]', UNIQUE(user_id,query)
);
CREATE TABLE audit (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  action TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX audit_owner ON audit(user_id,created);
CREATE TABLE oauth_consents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id TEXT NOT NULL, scopes TEXT NOT NULL, created INTEGER NOT NULL
);
