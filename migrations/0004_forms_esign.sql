-- Dynamic forms + e-sign (single-shop). Run after 0003.
-- Adds registration_number on customers and full form packet tables.

ALTER TABLE customers ADD COLUMN registration_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_regnum ON customers (registration_number) WHERE registration_number IS NOT NULL AND registration_number <> '';

CREATE TABLE IF NOT EXISTS shop_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO shop_settings (key, value) VALUES
  ('shop_code', 'BNB'),
  ('reg_number_format', '{CODE}-{YY}{MM}-{SEQ4}'),
  ('training_center_name', 'Banana Nut Burgers Dive Shop'),
  ('training_center_address', 'Tita''s Pink Seahorse Bar, West End, Roatán, Honduras'),
  ('timezone', 'America/Tegucigalpa');

CREATE TABLE IF NOT EXISTS form_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  schema_json TEXT NOT NULL DEFAULT '{}',
  pdf_r2_key TEXT NOT NULL DEFAULT '',
  pdf_mode TEXT NOT NULL DEFAULT 'overlay' CHECK (pdf_mode IN ('acroform','overlay')),
  pdf_mapping_json TEXT NOT NULL DEFAULT '{}',
  languages TEXT NOT NULL DEFAULT '["en","es"]',
  retention_days INTEGER NOT NULL DEFAULT 2555,
  valid_days INTEGER,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS form_packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  template_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS form_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  registration_id INTEGER REFERENCES registrations(id),
  booking_id INTEGER REFERENCES bookings(id),
  packet_id INTEGER REFERENCES form_packets(id),
  template_id INTEGER REFERENCES form_templates(id),
  template_versions TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','opened','completed','expired','revoked')),
  prefill_json TEXT NOT NULL DEFAULT '{}',
  draft_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  sent_via TEXT NOT NULL DEFAULT '',
  sent_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_freq_customer ON form_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_freq_status ON form_requests (status);
CREATE INDEX IF NOT EXISTS idx_freq_reg ON form_requests (registration_id);

CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES form_requests(id),
  customer_id INTEGER REFERENCES customers(id),
  registration_id INTEGER REFERENCES registrations(id),
  answers_encrypted TEXT NOT NULL DEFAULT '',
  signature_r2_key TEXT NOT NULL DEFAULT '',
  signed_pdf_r2_keys TEXT NOT NULL DEFAULT '[]',
  signer_name TEXT NOT NULL DEFAULT '',
  signed_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  guardian_json_encrypted TEXT NOT NULL DEFAULT '',
  pdf_sha256 TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  valid_until INTEGER,
  needs_physician INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fsub_customer ON form_submissions (customer_id);
CREATE INDEX IF NOT EXISTS idx_fsub_regnum ON form_submissions (registration_number);
CREATE INDEX IF NOT EXISTS idx_fsub_valid ON form_submissions (valid_until);

CREATE TABLE IF NOT EXISTS form_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  submission_id INTEGER,
  event TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  ip_hash TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_faudit_req ON form_audit_log (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS form_deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER,
  registration_number TEXT NOT NULL DEFAULT '',
  deleted_at INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'retention'
);

CREATE TABLE IF NOT EXISTS reg_number_seq (
  yymm TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);
