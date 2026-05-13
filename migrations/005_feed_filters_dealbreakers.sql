ALTER TABLE scores ADD COLUMN dealbreaker_violations TEXT NOT NULL DEFAULT '[]';

UPDATE jobs
SET status = 'ready_for_scoring',
    updated_at = datetime('now')
WHERE status = 'ready'
  AND description IS NOT NULL
  AND id IN (SELECT job_id FROM scores);

DELETE FROM llm_reasoning
WHERE job_id IN (SELECT job_id FROM scores);

DELETE FROM scores;

INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_min_score', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_hide_dealbreakers', 'false');
