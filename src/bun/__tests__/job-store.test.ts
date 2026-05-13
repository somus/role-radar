import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import {
  storeJobs,
  getJobFeed,
  getJobDetail,
  getJobReasoning,
  storeSearchQuery,
  updateHeuristicScores,
  getJobsForHeuristicScoring,
  getJobsForDetailFetch,
  setJobStatus,
  setJobDetails,
  getTopNSetting,
} from "../job-store";
import { updateScoreWeights } from "../score-weight-settings";
import type { ParsedJob, ParsedJobDetail } from "../../shared/types";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/002_enrichment_questions_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/003_generated_queries_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/004_job_status_index.sql"), "utf-8"),
].join("\n");

function makeJob(overrides: Partial<ParsedJob> = {}): ParsedJob {
  return {
    sourceId: "job_1",
    title: "Backend Engineer",
    company: "Acme Corp",
    location: "San Francisco, CA",
    url: "https://linkedin.com/jobs/view/job_1/",
    postedAt: "2026-04-25",
    status: "discovered",
    ...overrides,
  };
}

describe("storeJobs", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("inserts new jobs with status discovered and is_new=1", () => {
    const jobs = [makeJob()];
    const result = storeJobs(db, jobs);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);

    const row = db.query("SELECT * FROM jobs WHERE source_id = ?").get("job_1") as any;
    expect(row.title).toBe("Backend Engineer");
    expect(row.company).toBe("Acme Corp");
    expect(row.status).toBe("discovered");
    expect(row.is_new).toBe(1);
    expect(row.source).toBe("linkedin");
  });

  test("skips duplicate (source, source_id) via INSERT OR IGNORE", () => {
    const jobs = [makeJob()];
    storeJobs(db, jobs);
    const result = storeJobs(db, jobs);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);

    const count = (db.query("SELECT COUNT(*) as c FROM jobs").get() as any).c;
    expect(count).toBe(1);
  });

  test("inserts multiple jobs in one call", () => {
    const jobs = [
      makeJob({ sourceId: "a1", title: "Engineer A" }),
      makeJob({ sourceId: "a2", title: "Engineer B" }),
      makeJob({ sourceId: "a3", title: "Engineer C" }),
    ];
    const result = storeJobs(db, jobs);

    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(0);
  });

  test("stores parse_failed jobs", () => {
    const jobs = [makeJob({ sourceId: "", title: "", status: "parse_failed" })];
    storeJobs(db, jobs);

    const row = db.query("SELECT status FROM jobs LIMIT 1").get() as any;
    expect(row.status).toBe("parse_failed");
  });
});

describe("getJobFeed", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);

    for (let i = 0; i < 30; i++) {
      db.query(
        "INSERT INTO jobs (source, source_id, title, company, status, is_new) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("linkedin", `job_${i}`, `Role ${i}`, `Company ${i}`, "discovered", i < 10 ? 1 : 0);
    }
  });

  test("returns paginated results (first page)", () => {
    const result = getJobFeed(db, { limit: 25, offset: 0 });

    expect(result.jobs).toHaveLength(25);
    expect(result.total).toBe(30);
    expect(result.hasMore).toBe(true);
  });

  test("second page returns remaining jobs", () => {
    const result = getJobFeed(db, { limit: 25, offset: 25 });

    expect(result.jobs).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  test("excludes parse_failed jobs from feed and total count", () => {
    db.query(
      "INSERT INTO jobs (source, source_id, title, status) VALUES (?, ?, ?, ?)"
    ).run("linkedin", "failed_1", "Bad Job", "parse_failed");

    const result = getJobFeed(db, { limit: 50, offset: 0 });

    expect(result.jobs.every(j => j.status !== "parse_failed")).toBe(true);
    expect(result.total).toBe(30);
    expect(result.failedCount).toBe(1);
  });

  test("orders new jobs first, then by created_at desc", () => {
    const result = getJobFeed(db, { limit: 10, offset: 0 });

    const newJobs = result.jobs.filter(j => j.is_new);
    expect(newJobs.length).toBeGreaterThan(0);
    expect(result.jobs[0]!.is_new).toBe(true);
  });

  test("server-side weight changes can move a later-page job into the first page", () => {
    db.query("DELETE FROM jobs").run();
    db.query("INSERT INTO profiles (id, roles, seniority, preferences) VALUES (?, ?, ?, ?)").run(
      1,
      JSON.stringify(["Backend Engineer"]),
      "Senior",
      JSON.stringify({ locations: [], remote: false, min_salary: null, company_sizes: [], country: null }),
    );

    const insertJob = db.query(
      "INSERT INTO jobs (source, source_id, title, status, is_new) VALUES (?, ?, ?, ?, 0)"
    );
    const insertScore = db.query(
      `INSERT INTO scores (
        job_id, profile_id, skills_score, seniority_score, domain_score, location_score, composite, overqualified, matches, gaps
      ) VALUES (?, 1, ?, ?, ?, ?, ?, 0, '[]', '[]')`
    );

    for (let i = 0; i < 200; i++) {
      insertJob.run("linkedin", `skill_${i}`, `Skill-heavy ${i}`, "ready");
      const jobId = (db.query("SELECT id FROM jobs WHERE source_id = ?").get(`skill_${i}`) as { id: number }).id;
      insertScore.run(jobId, 90, 80, 80, 10, 70);
    }

    insertJob.run("linkedin", "location_winner", "Location Winner", "ready");
    const locationJobId = (db.query("SELECT id FROM jobs WHERE source_id = 'location_winner'").get() as { id: number }).id;
    insertScore.run(locationJobId, 10, 10, 10, 100, 32.5);

    const defaultPage = getJobFeed(db, { limit: 200, offset: 0 });
    expect(defaultPage.jobs.some((job) => job.source_id === "location_winner")).toBe(false);

    updateScoreWeights(db, {
      skills: 0,
      seniority: 0,
      domain: 0,
      location: 100,
    });

    const locationPage = getJobFeed(db, { limit: 200, offset: 0 });
    expect(locationPage.jobs[0]?.source_id).toBe("location_winner");
    expect(locationPage.jobs[0]?.weighted_composite).toBe(100);
  });

  test("returns correct Job shape with all fields", () => {
    const result = getJobFeed(db, { limit: 1, offset: 0 });
    const job = result.jobs[0]!;

    expect(job).toHaveProperty("id");
    expect(job).toHaveProperty("source");
    expect(job).toHaveProperty("source_id");
    expect(job).toHaveProperty("title");
    expect(job).toHaveProperty("status");
    expect(job).toHaveProperty("is_new");
    expect(typeof job.is_new).toBe("boolean");
    expect(typeof job.resume_generated).toBe("boolean");
  });

  test("getJobDetail returns score detail without reasoning payload", () => {
    db.query("INSERT INTO profiles (id, roles, seniority, preferences) VALUES (?, ?, ?, ?)").run(
      1,
      JSON.stringify(["Backend Engineer"]),
      "Senior",
      JSON.stringify({ locations: [], remote: false, min_salary: null, company_sizes: [], country: null }),
    );
    db.query("UPDATE jobs SET status = 'ready', description = 'desc' WHERE source_id = 'job_0'").run();
    const jobId = (db.query("SELECT id FROM jobs WHERE source_id = 'job_0'").get() as { id: number }).id;
    db.query(
      `INSERT INTO scores (
        job_id, profile_id, skills_score, seniority_score, domain_score, location_score, composite, overqualified, matches, gaps, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(jobId, 1, 80, 70, 60, 90, 77, 0, "[]", "[]", "Strong fit");
    db.query(
      "INSERT INTO llm_reasoning (job_id, profile_id, prompt, response, model) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)"
    ).run(
      jobId, 1, "old prompt", "old response", "gemini-2.5-flash",
      jobId, 1, "new prompt", "new response", "gemini-2.5-flash-lite",
    );

    const detail = getJobDetail(db, jobId);
    expect(detail?.summary).toBe("Strong fit");
    expect(detail?.description).toBe("desc");
    expect(detail).not.toHaveProperty("reasoning_prompt");
    expect(detail).not.toHaveProperty("reasoning_response");
    expect(detail).not.toHaveProperty("reasoning_model");
  });

  test("getJobReasoning returns latest reasoning payload on demand", () => {
    db.query("INSERT INTO profiles (id, roles, seniority, preferences) VALUES (?, ?, ?, ?)").run(
      1,
      JSON.stringify(["Backend Engineer"]),
      "Senior",
      JSON.stringify({ locations: [], remote: false, min_salary: null, company_sizes: [], country: null }),
    );
    const jobId = (db.query("SELECT id FROM jobs WHERE source_id = 'job_0'").get() as { id: number }).id;
    db.query(
      "INSERT INTO llm_reasoning (job_id, profile_id, prompt, response, model) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)"
    ).run(
      jobId, 1, "old prompt", "old response", "gemini-2.5-flash",
      jobId, 1, "new prompt", "new response", "gemini-2.5-flash-lite",
    );

    const reasoning = getJobReasoning(db, jobId);
    expect(reasoning).toEqual({
      prompt: "new prompt",
      response: "new response",
      model: "gemini-2.5-flash-lite",
    });
  });

  test("getJobReasoning returns null when no reasoning has been saved", () => {
    db.query("INSERT INTO profiles (id, roles, seniority, preferences) VALUES (?, ?, ?, ?)").run(
      1,
      JSON.stringify(["Backend Engineer"]),
      "Senior",
      JSON.stringify({ locations: [], remote: false, min_salary: null, company_sizes: [], country: null }),
    );
    const jobId = (db.query("SELECT id FROM jobs WHERE source_id = 'job_0'").get() as { id: number }).id;

    expect(getJobReasoning(db, jobId)).toBeNull();
  });
});

describe("storeSearchQuery", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
    db.query(
      "INSERT INTO profiles (roles, seniority) VALUES ('[]', 'Senior')"
    ).run();
  });

  test("stores search query in search_queries table", () => {
    storeSearchQuery(db, 1, {
      keywords: ["backend engineer", "fullstack"],
      location: "San Francisco",
      experienceLevel: "4",
    });

    const row = db.query("SELECT * FROM search_queries WHERE profile_id = 1").get() as any;
    expect(row.keywords).toBe("backend engineer, fullstack");
    expect(row.location).toBe("San Francisco");
    expect(row.experience_level).toBe("4");
    expect(row.query_type).toBe("precise");
  });

  test("stores search query with custom queryType", () => {
    storeSearchQuery(db, 1, {
      keywords: ["SRE"],
    }, "exploratory");

    const row = db.query("SELECT * FROM search_queries WHERE profile_id = 1").get() as any;
    expect(row.query_type).toBe("exploratory");
  });
});

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

function insertJob(db: Database, sourceId: string, status = "discovered", postedAt: string | null = null) {
  db.query(
    "INSERT INTO jobs (source, source_id, title, status, posted_at) VALUES (?, ?, ?, ?, ?)"
  ).run("linkedin", sourceId, `Job ${sourceId}`, status, postedAt);
  return (db.query("SELECT id FROM jobs WHERE source_id = ?").get(sourceId) as { id: number }).id;
}

describe("updateHeuristicScores", () => {
  test("bulk-updates heuristic_score for given job ids", () => {
    const db = freshDb();
    const a = insertJob(db, "a");
    const b = insertJob(db, "b");
    const c = insertJob(db, "c");

    updateHeuristicScores(db, [{ jobId: a, score: 0.9 }, { jobId: b, score: 0.5 }, { jobId: c, score: 0.1 }]);

    const rows = db.query("SELECT id, heuristic_score FROM jobs ORDER BY id").all() as any[];
    expect(rows[0]!.heuristic_score).toBeCloseTo(0.9, 5);
    expect(rows[1]!.heuristic_score).toBeCloseTo(0.5, 5);
    expect(rows[2]!.heuristic_score).toBeCloseTo(0.1, 5);
  });

  test("no-op for empty input", () => {
    const db = freshDb();
    insertJob(db, "a");
    updateHeuristicScores(db, []);
    const row = db.query("SELECT heuristic_score FROM jobs LIMIT 1").get() as any;
    expect(row.heuristic_score).toBeNull();
  });
});

describe("getJobsForHeuristicScoring", () => {
  test("returns discovered jobs", () => {
    const db = freshDb();
    insertJob(db, "a", "discovered");
    insertJob(db, "b", "discovered");
    insertJob(db, "c", "ready_for_scoring");

    const jobs = getJobsForHeuristicScoring(db);
    expect(jobs.map(j => j.source_id).sort()).toEqual(["a", "b"]);
  });

  test("includes fetch_failed jobs older than 24h, excludes recent failures", () => {
    const db = freshDb();
    insertJob(db, "stale", "fetch_failed");
    db.query("UPDATE jobs SET updated_at = datetime('now', '-2 days') WHERE source_id = 'stale'").run();
    insertJob(db, "recent", "fetch_failed");

    const jobs = getJobsForHeuristicScoring(db);
    expect(jobs.map(j => j.source_id)).toEqual(["stale"]);
  });

  test("excludes parse_failed", () => {
    const db = freshDb();
    insertJob(db, "ok", "discovered");
    insertJob(db, "bad", "parse_failed");

    const jobs = getJobsForHeuristicScoring(db);
    expect(jobs.map(j => j.source_id)).toEqual(["ok"]);
  });
});

describe("setJobStatus", () => {
  test("transitions job status and bumps updated_at", () => {
    const db = freshDb();
    const id = insertJob(db, "a", "discovered");

    setJobStatus(db, id, "queued");
    const row = db.query("SELECT status FROM jobs WHERE id = ?").get(id) as any;
    expect(row.status).toBe("queued");
  });
});

describe("setJobDetails", () => {
  test("populates description + 4 criteria fields and sets status=ready_for_scoring", () => {
    const db = freshDb();
    const id = insertJob(db, "a", "fetching");

    const details: ParsedJobDetail = {
      description: "Build cool things.",
      seniority: "Senior",
      employmentType: "Full-time",
      function: "Engineering",
      industry: "Software",
    };
    setJobDetails(db, id, details);

    const row = db.query("SELECT * FROM jobs WHERE id = ?").get(id) as any;
    expect(row.status).toBe("ready_for_scoring");
    expect(row.description).toBe("Build cool things.");
    expect(row.seniority_level).toBe("Senior");
    expect(row.employment_type).toBe("Full-time");
    expect(row.job_function).toBe("Engineering");
    expect(row.industry).toBe("Software");
  });
});

describe("getJobsForDetailFetch", () => {
  test("returns queued jobs ordered by heuristic_score desc, capped at limit", () => {
    const db = freshDb();
    const a = insertJob(db, "a", "queued");
    const b = insertJob(db, "b", "queued");
    const c = insertJob(db, "c", "queued");
    insertJob(db, "d", "discovered");
    updateHeuristicScores(db, [{ jobId: a, score: 0.5 }, { jobId: b, score: 0.9 }, { jobId: c, score: 0.1 }]);

    const jobs = getJobsForDetailFetch(db, 2);
    expect(jobs.map(j => j.source_id)).toEqual(["b", "a"]);
  });
});

describe("getTopNSetting", () => {
  test("returns 50 by default from migration", () => {
    const db = freshDb();
    expect(getTopNSetting(db)).toBe(50);
  });

  test("returns custom value when settings row updated", () => {
    const db = freshDb();
    db.query("UPDATE settings SET value = '20' WHERE key = 'top_n_detail_fetch'").run();
    expect(getTopNSetting(db)).toBe(20);
  });
});
