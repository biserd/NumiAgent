ALTER TABLE imports ADD COLUMN auto_catalog INTEGER NOT NULL DEFAULT 0 CHECK(auto_catalog IN (0,1));
CREATE INDEX item_photos_by_photo ON item_photos(user_id, photo_id, item_id);
