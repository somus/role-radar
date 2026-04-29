CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roles TEXT NOT NULL DEFAULT '[]',
  skills_primary TEXT NOT NULL DEFAULT '[]',
  skills_secondary TEXT NOT NULL DEFAULT '[]',
  experience_years INTEGER NOT NULL DEFAULT 0,
  seniority TEXT NOT NULL DEFAULT '',
  domains TEXT NOT NULL DEFAULT '[]',
  preferences TEXT NOT NULL DEFAULT '{}',
  career_intent TEXT,
  dealbreakers TEXT NOT NULL DEFAULT '[]',
  problem_solving_stories TEXT NOT NULL DEFAULT '[]',
  technical_depth TEXT NOT NULL DEFAULT '[]',
  resume_pdf_path TEXT,
  resume_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'linkedin',
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  url TEXT,
  posted_at TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  description TEXT,
  seniority_level TEXT,
  employment_type TEXT,
  job_function TEXT,
  industry TEXT,
  heuristic_score REAL,
  resume_generated INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skills_score REAL NOT NULL,
  seniority_score REAL NOT NULL,
  domain_score REAL NOT NULL,
  location_score REAL NOT NULL,
  composite REAL NOT NULL,
  overqualified INTEGER NOT NULL DEFAULT 0,
  matches TEXT NOT NULL DEFAULT '[]',
  gaps TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, profile_id)
);

CREATE TABLE IF NOT EXISTS llm_reasoning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrichment_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  keywords TEXT NOT NULL,
  location TEXT,
  experience_level TEXT,
  query_type TEXT NOT NULL DEFAULT 'precise',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('weights_skills', '40');
INSERT OR IGNORE INTO settings (key, value) VALUES ('weights_seniority', '20');
INSERT OR IGNORE INTO settings (key, value) VALUES ('weights_domain', '15');
INSERT OR IGNORE INTO settings (key, value) VALUES ('weights_location', '25');
INSERT OR IGNORE INTO settings (key, value) VALUES ('selected_model', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('last_refresh_at', '');
