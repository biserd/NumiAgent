ALTER TABLE users ADD COLUMN external_photo_search INTEGER NOT NULL DEFAULT 0 CHECK(external_photo_search IN (0,1));
ALTER TABLE imports ADD COLUMN scan_plan TEXT;
ALTER TABLE photos ADD COLUMN scan_slot INTEGER CHECK(scan_slot BETWEEN 0 AND 99);
ALTER TABLE photos ADD COLUMN scan_result TEXT;
CREATE UNIQUE INDEX photos_scan_slot ON photos(batch_id, scan_slot) WHERE scan_slot IS NOT NULL;
