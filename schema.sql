CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','done')),
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  guests INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  divers TEXT NOT NULL DEFAULT '[]',
  cruise TEXT,
  note TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_ip ON bookings (ip_hash, created_at);

-- Registration system (migration 0002)
-- 0002: customer registration, e-signature, documents, consents, audit, corrections
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  preferred_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',        -- normalized digits
  email TEXT NOT NULL DEFAULT ''         -- lowercase
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,              -- public reference e.g. BNB-2026-AB12CD
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','flagged','corrections_requested')),
  form_version TEXT NOT NULL DEFAULT 'registration-v1',
  data TEXT NOT NULL DEFAULT '{}',       -- form answers (JSON)
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  review_note TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reg_customer ON registrations (customer_id);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_reg_created ON registrations (created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'registration',
  version TEXT NOT NULL DEFAULT 'registration-v1',
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_doc_reg ON documents (registration_id);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  created_at INTEGER NOT NULL,           -- signed_at (server time)
  signer_name TEXT NOT NULL DEFAULT '',  -- typed legal name
  r2_key TEXT NOT NULL DEFAULT '',       -- signature PNG in private R2
  document_sha256 TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sig_reg ON signatures (registration_id);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  created_at INTEGER NOT NULL,
  purpose TEXT NOT NULL,                 -- accuracy_declaration | privacy_ack | marketing
  granted INTEGER NOT NULL DEFAULT 0,
  text_version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_consent_reg ON consents (registration_id);

CREATE TABLE IF NOT EXISTS correction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER REFERENCES registrations(id),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_corr_status ON correction_requests (status);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',  -- admin | customer | system
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

