CREATE TABLE guest_sale_choices (
  ticket_hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  selection TEXT NOT NULL
);
CREATE INDEX guest_sale_choices_expiry ON guest_sale_choices(expires);
