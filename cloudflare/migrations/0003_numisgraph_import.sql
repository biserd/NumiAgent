ALTER TABLE items ADD COLUMN legacy_coin_id TEXT;
CREATE UNIQUE INDEX items_owner_legacy_coin ON items(user_id, legacy_coin_id);
