ALTER TABLE imports ADD COLUMN paired INTEGER NOT NULL DEFAULT 0 CHECK(paired IN (0,1));
ALTER TABLE photos ADD COLUMN pair_side TEXT CHECK(pair_side IN ('obverse','reverse'));
CREATE UNIQUE INDEX photos_pair_side ON photos(batch_id, pair_side) WHERE pair_side IS NOT NULL;
