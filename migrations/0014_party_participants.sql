-- 0014: Group registration — one party registration, many participants, each with own packet
-- Reuses form_requests / form_submissions / stamping; adds participant_id links.

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  contact_id INTEGER REFERENCES customers(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  is_minor INTEGER NOT NULL DEFAULT 0,
  relationship TEXT NOT NULL DEFAULT 'self',
  mode TEXT NOT NULL DEFAULT 'here' CHECK (mode IN ('here','own_phone')),
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('primary','guest')),
  guardian_participant_id INTEGER REFERENCES participants(id),
  guardian_json TEXT NOT NULL DEFAULT '{}',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','needs_medical_review','waiting_youth_addendum','waiting_guardian','complete','removed')),
  registration_number TEXT NOT NULL DEFAULT '',
  youth_addendum_status TEXT NOT NULL DEFAULT 'n/a'
    CHECK (youth_addendum_status IN ('n/a','waiting','received')),
  valid_until INTEGER,
  same_address INTEGER NOT NULL DEFAULT 1,
  same_emergency INTEGER NOT NULL DEFAULT 1,
  address_json TEXT NOT NULL DEFAULT '{}',
  emergency_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  remove_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_part_reg ON participants (registration_id);
CREATE INDEX IF NOT EXISTS idx_part_contact ON participants (contact_id);
CREATE INDEX IF NOT EXISTS idx_part_status ON participants (status);

-- Link existing form pipeline rows to a participant (nullable = legacy single-person regs)
ALTER TABLE form_requests ADD COLUMN participant_id INTEGER REFERENCES participants(id);
CREATE INDEX IF NOT EXISTS idx_freq_participant ON form_requests (participant_id);

ALTER TABLE form_submissions ADD COLUMN participant_id INTEGER REFERENCES participants(id);
CREATE INDEX IF NOT EXISTS idx_fsub_participant ON form_submissions (participant_id);

-- Party-level shared defaults on the registration (primary contact already on customer)
ALTER TABLE registrations ADD COLUMN shared_address_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE registrations ADD COLUMN shared_emergency_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE registrations ADD COLUMN party_complete INTEGER NOT NULL DEFAULT 0;

-- Shop setting: minor also signs (default off). Stored in shop_settings as key minor_also_signs.
INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('minor_also_signs', '0');
