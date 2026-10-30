-- Shop promotions / deals shown on the public homepage.
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_es TEXT,
  blurb TEXT,
  blurb_es TEXT,
  badge TEXT NOT NULL DEFAULT 'THIS WEEK''S SPECIAL',
  badge_es TEXT,
  cta_label TEXT NOT NULL DEFAULT 'BOOK THIS DEAL',
  cta_label_es TEXT,
  cta_url TEXT,
  ends_label TEXT,
  ends_label_es TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (active, sort_order, id);
