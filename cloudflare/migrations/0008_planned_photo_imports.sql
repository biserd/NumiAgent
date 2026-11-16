ALTER TABLE imports ADD COLUMN expected_photos INTEGER CHECK(expected_photos BETWEEN 1 AND 20);
