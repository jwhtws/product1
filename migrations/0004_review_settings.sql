CREATE TABLE IF NOT EXISTS service_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO service_settings (setting_key, setting_value, updated_at) VALUES
  ('daily_review_limit', '5', 0),
  ('restaurant_daily_review_limit', '1', 0),
  ('duplicate_review_block', '1', 0);
