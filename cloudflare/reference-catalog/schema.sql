CREATE TABLE IF NOT EXISTS catalog_release (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), version TEXT NOT NULL, total INTEGER NOT NULL, sources TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog_entries (
  row_id INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('coin','banknote')),
  title TEXT NOT NULL, issuer TEXT NOT NULL, denomination TEXT NOT NULL, year TEXT NOT NULL,
  source TEXT NOT NULL, dataset TEXT NOT NULL, attribution TEXT NOT NULL, license TEXT NOT NULL, details TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
  id,title,issuer,denomination,year,details,content='catalog_entries',content_rowid='row_id',tokenize='unicode61 remove_diacritics 2'
);
