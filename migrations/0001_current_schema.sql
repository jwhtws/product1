CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  restaurant_id TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  helpful INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER NOT NULL,
  data_key TEXT NOT NULL,
  data_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, data_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  attempt_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL,
  window_started INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS reviews_restaurant_idx ON reviews(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_user_idx ON reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_idx ON activity_events(event_type, created_at DESC);
