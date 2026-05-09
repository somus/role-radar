import type { Database } from "bun:sqlite";
import type { Job, JobFeedParams, JobFeedResult, ParsedJob, ParsedJobDetail, SearchQuery } from "../shared/types";

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
    SELECT * FROM jobs
    WHERE status != 'parse_failed'
    ORDER BY is_new DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  return {
    jobs: rows.map(deserializeJob),
    total,
    hasMore: offset + limit < total,
    failedCount,
  };
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
