import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { storeJobs, getJobFeed, storeSearchQuery } from "../job-store";
import type { ParsedJob } from "../../shared/types";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/002_enrichment_questions_cache.sql"), "utf-8"),
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
  });
});
