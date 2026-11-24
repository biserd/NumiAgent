CREATE TABLE checklist_auction_settings (
  theme_id TEXT PRIMARY KEY REFERENCES themes(id) ON DELETE CASCADE,
  email INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  synced INTEGER NOT NULL DEFAULT 0
);
INSERT INTO checklist_auction_settings(theme_id) SELECT id FROM themes;
CREATE TRIGGER checklist_auction_insert AFTER INSERT ON themes BEGIN
  INSERT INTO checklist_auction_settings(theme_id) VALUES (NEW.id);
END;
CREATE TRIGGER checklist_auction_edit AFTER UPDATE OF slots ON themes WHEN NEW.slots <> OLD.slots BEGIN
  UPDATE checklist_auction_settings SET revision=revision+1 WHERE theme_id=NEW.id;
END;
ALTER TABLE gap_watches ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gap_watches ADD COLUMN in_rules INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gap_watches ADD COLUMN last_result TEXT;
CREATE INDEX gap_auto_due ON gap_watches(checked,id) WHERE paused=0 AND in_rules=1;

CREATE TABLE specimen_guide_links (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,
  type_id INTEGER NOT NULL,
  issue_id INTEGER NOT NULL
);
