ALTER TABLE jobs ADD COLUMN posted_at_ts INTEGER;
ALTER TABLE jobs ADD COLUMN posted_at_confidence TEXT NOT NULL DEFAULT 'missing';
ALTER TABLE jobs ADD COLUMN posted_text TEXT;
ALTER TABLE jobs ADD COLUMN description_excerpt_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN dedup_key TEXT;
ALTER TABLE jobs ADD COLUMN canonical_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_dedup_key ON jobs(dedup_key);
CREATE INDEX IF NOT EXISTS idx_jobs_canonical ON jobs(canonical_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at_ts ON jobs(posted_at_ts);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_ok_at INTEGER,
  last_attempted_at INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_source_settings (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_source_settings (source, enabled) VALUES
  ('linkedin', 1),
  ('naukri', 1),
  ('indeed', 1),
  ('foundit', 1),
  ('shine', 1),
  ('timesjobs', 1),
  ('freshersworld', 1),
  ('internshala', 1),
  ('cutshort', 1),
  ('apna', 1);

INSERT OR IGNORE INTO source_health (source, status) VALUES
  ('linkedin', 'ok'),
  ('naukri', 'ok'),
  ('indeed', 'ok'),
  ('foundit', 'ok'),
  ('shine', 'ok'),
  ('timesjobs', 'ok'),
  ('freshersworld', 'ok'),
  ('internshala', 'ok'),
  ('cutshort', 'ok'),
  ('apna', 'ok');

INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_sort_mode', 'best_match');
