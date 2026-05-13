import type { Database } from "bun:sqlite";
import type { Job, JobDetail, JobFeedItem, JobFeedParams, JobFeedResult, JobReasoning, ParsedJob, ParsedJobDetail, SearchQuery } from "../shared/types";
import { scoreGroup } from "../shared/score-weights";

export function storeJobs(
  db: Database,
  jobs: ParsedJob[]
): { inserted: number; skipped: number } {
  const countBefore = (db.query("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;

  const insert = db.transaction((batch: ParsedJob[]) => {
    const stmt = db.query(`
      INSERT OR IGNORE INTO jobs (source, source_id, title, company, location, url, posted_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const job of batch) {
      stmt.run(
        "linkedin",
        job.sourceId,
        job.title,
        job.company,
        job.location,
        job.url,
        job.postedAt,
        job.status
      );
    }
  });

  insert(jobs);

  const countAfter = (db.query("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;
  const inserted = countAfter - countBefore;
  return { inserted, skipped: jobs.length - inserted };
}

export function getJobFeed(
  db: Database,
  params: JobFeedParams
): JobFeedResult {
  const { limit, offset } = params;

  const total = (db.query(
    "SELECT COUNT(*) as c FROM jobs WHERE status != 'parse_failed'"
  ).get() as { c: number }).c;

  const failedCount = (db.query(
    "SELECT COUNT(*) as c FROM jobs WHERE status = 'parse_failed'"
  ).get() as { c: number }).c;

  const rows = db.query(`
    SELECT
      j.*,
      s.skills_score,
      s.seniority_score,
      s.domain_score,
      s.location_score,
      s.composite,
      s.overqualified,
      s.matches,
      s.gaps,
      s.summary,
      (
        COALESCE(s.skills_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_skills')
        + COALESCE(s.seniority_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_seniority')
        + COALESCE(s.domain_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_domain')
        + COALESCE(s.location_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_location')
      ) AS weighted_composite
    FROM jobs j
    LEFT JOIN scores s
      ON s.job_id = j.id
      AND s.profile_id = (SELECT id FROM profiles ORDER BY id LIMIT 1)
    WHERE j.status != 'parse_failed'
    ORDER BY
      CASE WHEN s.id IS NULL THEN 1 ELSE 0 END,
      weighted_composite DESC,
      j.is_new DESC,
      j.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  return {
    jobs: rows.map(deserializeJobFeedItem),
    total,
    hasMore: offset + limit < total,
    failedCount,
  };
}

export function getJobDetail(db: Database, jobId: number): JobDetail | null {
  const row = db.query(`
    SELECT
      j.*,
      s.skills_score,
      s.seniority_score,
      s.domain_score,
      s.location_score,
      s.composite,
      s.overqualified,
      s.matches,
      s.gaps,
      s.summary,
      (
        COALESCE(s.skills_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_skills')
        + COALESCE(s.seniority_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_seniority')
        + COALESCE(s.domain_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_domain')
        + COALESCE(s.location_score, 0) * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_location')
      ) AS weighted_composite
    FROM jobs j
    LEFT JOIN scores s
      ON s.job_id = j.id
      AND s.profile_id = (SELECT id FROM profiles ORDER BY id LIMIT 1)
    WHERE j.id = ?
  `).get(jobId) as any | null;

  return row ? deserializeJobFeedItem(row) : null;
}

export function getJobReasoning(db: Database, jobId: number): JobReasoning | null {
  const row = db.query(`
    SELECT prompt, response, model
    FROM llm_reasoning
    WHERE job_id = ?
      AND profile_id = (SELECT id FROM profiles ORDER BY id LIMIT 1)
    ORDER BY id DESC
    LIMIT 1
  `).get(jobId) as { prompt: string; response: string; model: string } | null;

  return row;
}

export function storeSearchQuery(
  db: Database,
  profileId: number,
  query: SearchQuery,
  queryType: string = "precise"
): void {
  db.query(`
    INSERT INTO search_queries (profile_id, keywords, location, experience_level, query_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(profileId, query.keywords.join(", "), query.location ?? null, query.experienceLevel ?? null, queryType);
}

export function updateHeuristicScores(db: Database, scores: { jobId: number; score: number }[]): void {
  if (scores.length === 0) return;
  const stmt = db.query("UPDATE jobs SET heuristic_score = ?, updated_at = datetime('now') WHERE id = ?");
  const tx = db.transaction((batch: { jobId: number; score: number }[]) => {
    for (const s of batch) stmt.run(s.score, s.jobId);
  });
  tx(scores);
}

export function getJobsForHeuristicScoring(db: Database): Job[] {
  const rows = db.query(`
    SELECT * FROM jobs
    WHERE status = 'discovered'
       OR (status = 'fetch_failed' AND updated_at < datetime('now', '-1 day'))
    ORDER BY id
  `).all() as any[];
  return rows.map(deserializeJob);
}

// Ordered by heuristic_score DESC; ties broken by id ASC for deterministic dispatch.
export function getJobsForDetailFetch(db: Database, limit: number): Job[] {
  const rows = db.query(`
    SELECT * FROM jobs
    WHERE status = 'queued'
    ORDER BY heuristic_score DESC NULLS LAST, id ASC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(deserializeJob);
}

export function setJobStatus(db: Database, jobId: number, status: string): void {
  db.query("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, jobId);
}

export function setJobDetails(db: Database, jobId: number, details: ParsedJobDetail): void {
  db.query(`
    UPDATE jobs SET
      description = ?,
      seniority_level = ?,
      employment_type = ?,
      job_function = ?,
      industry = ?,
      status = 'ready_for_scoring',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    details.description,
    details.seniority,
    details.employmentType,
    details.function,
    details.industry,
    jobId,
  );
}

export function getTopNSetting(db: Database): number {
  const row = db.query("SELECT value FROM settings WHERE key = 'top_n_detail_fetch'").get() as { value: string } | null;
  const n = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 50;
}

function deserializeJob(row: any): Job {
  return {
    id: row.id,
    source: row.source,
    source_id: row.source_id,
    title: row.title,
    company: row.company,
    location: row.location,
    url: row.url,
    posted_at: row.posted_at,
    status: row.status,
    description: row.description,
    seniority_level: row.seniority_level,
    employment_type: row.employment_type,
    job_function: row.job_function,
    industry: row.industry,
    heuristic_score: row.heuristic_score,
    resume_generated: !!row.resume_generated,
    is_new: !!row.is_new,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deserializeJobFeedItem(row: any): JobFeedItem {
  const base = deserializeJob(row);
  const weightedComposite = row.skills_score == null
    ? null
    : Number(Number(row.weighted_composite ?? 0).toFixed(2));

  return {
    ...base,
    skills_score: row.skills_score ?? null,
    seniority_score: row.seniority_score ?? null,
    domain_score: row.domain_score ?? null,
    location_score: row.location_score ?? null,
    composite: row.composite ?? null,
    weighted_composite: weightedComposite,
    score_group: weightedComposite == null ? null : scoreGroup(weightedComposite),
    overqualified: row.overqualified == null ? null : !!row.overqualified,
    matches: safeParseJson(row.matches, []),
    gaps: safeParseJson(row.gaps, []),
    summary: row.summary ?? null,
  };
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
