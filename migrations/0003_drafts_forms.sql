-- 0003: resumable drafts, idempotency, trip/activity fields, admin form configuration
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS registrations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','under_review','approved','rejected','flagged','corrections_requested','complete')),
  form_version TEXT NOT NULL DEFAULT 'registration-v1',
  data TEXT NOT NULL DEFAULT '{}',
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  review_note TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  draft_token_hash TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  activity TEXT NOT NULL DEFAULT '',
  planned_date TEXT NOT NULL DEFAULT '',
  participants INTEGER NOT NULL DEFAULT 1,
  booking_ref TEXT NOT NULL DEFAULT ''
);
INSERT INTO registrations_new (id,ref,customer_id,created_at,updated_at,status,form_version,data,is_duplicate,review_note,ip_hash)
  SELECT id,ref,customer_id,created_at,updated_at,status,form_version,data,is_duplicate,review_note,ip_hash FROM registrations;
DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;
CREATE INDEX IF NOT EXISTS idx_reg_customer ON registrations (customer_id);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_reg_created ON registrations (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_idem ON registrations (idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL DEFAULT '',
  name_es TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  desc_es TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  activities TEXT NOT NULL DEFAULT '[]',
  version TEXT NOT NULL DEFAULT 'registration-v1',
  active INTEGER NOT NULL DEFAULT 1,
  review_required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS form_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES forms(id),
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  version TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_formver_form ON form_versions (form_id, created_at DESC);

INSERT OR IGNORE INTO forms (key,name_en,name_es,desc_en,desc_es,required,activities,version,active,review_required,sort_order,created_at,updated_at)
VALUES ('registration','Customer Registration','Registro de clientes',
        'Your contact and diver information, accuracy declaration, and electronic signature.',
        'Tu información de contacto y de buzo, declaración de exactitud y firma electrónica.',
        1,'[]','registration-v1',1,1,1,0,0);

PRAGMA foreign_keys=ON;
