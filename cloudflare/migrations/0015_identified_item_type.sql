ALTER TABLE items ADD COLUMN type_locked INTEGER NOT NULL DEFAULT 0 CHECK (type_locked IN (0,1));

UPDATE items SET type_locked=1 WHERE EXISTS (
  SELECT 1 FROM item_photos l JOIN photos p ON p.user_id=l.user_id AND p.id=l.photo_id,
       json_each(CASE WHEN json_valid(p.candidates) THEN p.candidates ELSE '[]' END) c
   WHERE l.user_id=items.user_id AND l.item_id=items.id AND json_extract(c.value,'$.type')=items.type
     AND (p.id=items.id OR json_extract(c.value,'$.title')=items.title COLLATE NOCASE)
);

CREATE TRIGGER preserve_identified_item_type BEFORE UPDATE OF type ON items
WHEN OLD.type_locked=1 AND NEW.type<>OLD.type
BEGIN
  SELECT RAISE(ABORT,'identified item type is fixed');
END;
