-- Log each promotion blast to marketing-opted customers.
CREATE TABLE IF NOT EXISTS promo_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id),
  sent_at INTEGER NOT NULL,
  channels TEXT NOT NULL DEFAULT '',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  emailed INTEGER NOT NULL DEFAULT 0,
  whatsapp INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS idx_promo_sends_promo ON promo_sends (promotion_id, sent_at DESC);
