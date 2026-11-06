-- Today's booking counts and the homepage editor.
-- Adds columns only. Does not update or delete existing booking rows.
-- Applied by ensureSchema when a column is missing. Do not run this by hand
-- against production if the columns are already there.

ALTER TABLE bookings ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN dive_done INTEGER NOT NULL DEFAULT 0;
