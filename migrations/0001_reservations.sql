CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'blocked', 'pending', 'cancelled')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  guest_name TEXT,
  guest_contact TEXT,
  guests INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'direct',
  total_price INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_dates
ON reservations (start_date, end_date, status);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  contact TEXT,
  requested_start TEXT,
  requested_end TEXT,
  guests INTEGER,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  nightly_price INTEGER NOT NULL,
  min_nights INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('max_guests', '8'),
  ('extra_guest_note', 'Posibilidad de una plaza adicional bajo consulta'),
  ('contact_phone', '+34606818656'),
  ('contact_email', 'acasadomuineiro@gmail.com');
