CREATE INDEX IF NOT EXISTS idx_jobs_status_score ON jobs(status, heuristic_score DESC);

INSERT OR IGNORE INTO settings (key, value) VALUES ('top_n_detail_fetch', '50');
