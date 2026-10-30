-- Diving Medical Guidance reference template + instructor setting
INSERT OR IGNORE INTO form_templates (key, name, version, status, schema_json, pdf_r2_key, pdf_mode, pdf_mapping_json, languages, retention_days, valid_days, created_at, updated_at)
VALUES (
  'diving_medical_guidance',
  'Diving Medical Guidance (physician reference)',
  '1',
  'active',
  '{"key":"diving_medical_guidance","consent":{"required":false},"sections":[]}',
  '',
  'overlay',
  '{}',
  '["en","es"]',
  2555,
  NULL,
  strftime('%s','now')*1000,
  strftime('%s','now')*1000
);

INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('instructor_name', '');
INSERT OR IGNORE INTO shop_settings (key, value) VALUES ('facility_name', 'Banana Nut Burgers Dive Shop');

-- Optional opt-out list for WhatsApp form links
CREATE TABLE IF NOT EXISTS whatsapp_opt_out (
  phone TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

-- Activate youth addendum when present (still draft until PDF uploaded)
UPDATE form_templates SET status='active', name='Youth Addendum' WHERE key='youth_addendum';
