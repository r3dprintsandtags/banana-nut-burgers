-- Additive columns and the public cancel/reschedule inbox.
-- Pages Functions also apply this on first request (ensureSchema).
ALTER TABLE registrations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS schedule_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reservation_number TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'cancel',
  preferred_date TEXT NOT NULL DEFAULT '',
  registration_id INTEGER
);
