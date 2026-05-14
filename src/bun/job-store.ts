import type { Database } from "bun:sqlite";
import { DEFAULT_JOB_FEED_FILTERS, JOB_SOURCE_IDS, type Job, type JobDetail, type JobFeedFilters, type JobFeedItem, type JobFeedParams, type JobFeedResult, type JobReasoning, type JobSourceId, type ParsedJob, type ParsedJobDetail, type SearchQuery } from "../shared/types";
import { scoreGroup } from "../shared/score-weights";
import { normalizePostedAt } from "./posted-at-normalizer";

export function storeJobs(
  db: Database,
  jobs: ParsedJob[]
): { inserted: number; skipped: number } {
  const countBefore = (db.query("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;

  const insert = db.transaction((batch: ParsedJob[]) => {
    const stmt = db.query(`
      INSERT OR IGNORE INTO jobs (
        source, source_id, title, company, location, url,
        posted_at, posted_at_ts, posted_at_confidence, posted_text,
        description_excerpt_only, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const job of batch) {
      const rawPosted = job.postedText ?? job.postedAt;
      const { postedAtTs, confidence } = normalizePostedAt(rawPosted);
      stmt.run(
        job.source,
        job.sourceId,
        job.title,
        job.company,
        job.location,
        job.url,
        job.postedAt,
        postedAtTs,
        job.postedAtConfidence ?? confidence,
        rawPosted,
        job.descriptionExcerptOnly ? 1 : 0,
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
  const filters = normalizeFeedFilters(params.filters);
  const hideDealbreakers = filters.hideDealbreakers ? 1 : 0;
  const sourcePlaceholders = filters.enabledSources.map(() => "?").join(", ");

  const filteredFeedCte = `
    WITH feed AS (
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
        s.dealbreaker_violations,
        s.summary,
        CASE
          WHEN s.job_id IS NULL THEN NULL
          ELSE (
            s.skills_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_skills')
            + s.seniority_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_seniority')
            + s.domain_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_domain')
            + s.location_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_location')
          )
        END AS weighted_composite
      FROM jobs j
      LEFT JOIN scores s
        ON s.job_id = j.id
        AND s.profile_id = (SELECT id FROM profiles ORDER BY id LIMIT 1)
      WHERE j.status != 'parse_failed'
        AND COALESCE(j.canonical_job_id, j.id) = j.id
        AND j.source IN (${sourcePlaceholders})
    )
  `;

  const filterWhere = `
    WHERE (weighted_composite IS NULL OR weighted_composite >= ?)
      AND (? = 0 OR COALESCE(dealbreaker_violations, '[]') = '[]')
  `;

  const orderBy = filters.sortMode === "most_recent"
    ? `ORDER BY
        CASE WHEN posted_at_confidence = 'missing' THEN 1 ELSE 0 END,
        posted_at_ts DESC,
        CASE WHEN skills_score IS NULL THEN 1 ELSE 0 END,
        created_at DESC`
    : `ORDER BY
        CASE WHEN skills_score IS NULL THEN 1 ELSE 0 END,
        weighted_composite DESC,
        is_new DESC,
        posted_at_ts DESC,
        created_at DESC`;

  const countParams = [...filters.enabledSources, filters.minScore, hideDealbreakers];
  const total = (db.query(`
    ${filteredFeedCte}
    SELECT COUNT(*) as c FROM feed
    ${filterWhere}
  `).get(...countParams) as { c: number }).c;

  const failedCount = (db.query(
    "SELECT COUNT(*) as c FROM jobs WHERE status = 'parse_failed'"
  ).get() as { c: number }).c;

  const rowParams = [...filters.enabledSources, filters.minScore, hideDealbreakers, limit, offset];
  const rows = db.query(`
    ${filteredFeedCte}
    SELECT * FROM feed
    ${filterWhere}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...rowParams) as any[];

  return {
    jobs: rows.map(deserializeJobFeedItem),
    total,
    hasMore: offset + limit < total,
    failedCount,
  };
}

export function normalizeFeedFilters(filters: JobFeedFilters | undefined): JobFeedFilters {
  if (!filters) return DEFAULT_JOB_FEED_FILTERS;
  return {
    minScore: Number.isFinite(filters.minScore)
      ? Math.max(0, Math.min(100, Math.round(filters.minScore)))
      : DEFAULT_JOB_FEED_FILTERS.minScore,
    hideDealbreakers: typeof filters.hideDealbreakers === "boolean"
      ? filters.hideDealbreakers
      : DEFAULT_JOB_FEED_FILTERS.hideDealbreakers,
    enabledSources: Array.isArray(filters.enabledSources) && filters.enabledSources.length > 0
      ? filters.enabledSources
      : DEFAULT_JOB_FEED_FILTERS.enabledSources,
    sortMode: filters.sortMode === "most_recent" || filters.sortMode === "best_match"
      ? filters.sortMode
      : DEFAULT_JOB_FEED_FILTERS.sortMode,
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
      s.dealbreaker_violations,
      s.summary,
      CASE
        WHEN s.job_id IS NULL THEN NULL
        ELSE (
          s.skills_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_skills')
          + s.seniority_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_seniority')
          + s.domain_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_domain')
          + s.location_score * (SELECT CAST(value AS REAL) / 100 FROM settings WHERE key = 'weights_location')
        )
      END AS weighted_composite
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
    posted_at_ts: row.posted_at_ts ?? null,
    posted_at_confidence: row.posted_at_confidence ?? "missing",
    posted_text: row.posted_text ?? null,
    description_excerpt_only: !!row.description_excerpt_only,
    canonical_job_id: row.canonical_job_id ?? null,
    dedup_key: row.dedup_key ?? null,
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
    dealbreaker_violations: safeParseJson(row.dealbreaker_violations, []),
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
