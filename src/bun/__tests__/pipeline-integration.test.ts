import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { shutdownManager } from "bunqueue/client";
import { DetailFetchQueue, runHeuristicAndQueueDetails } from "../detail-fetch-queue";
import type { LinkedInAdapter } from "../linkedin-adapter";
import type { ParsedJobDetail, Profile } from "../../shared/types";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/002_enrichment_questions_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/003_generated_queries_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/004_job_status_index.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/005_feed_filters_dealbreakers.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/006_profile_resume_json.sql"), "utf-8"),
].join("\n");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

const profile: Profile = {
  id: 1,
  roles: ["Backend Engineer", "Staff SRE"],
  skills_primary: [],
  skills_secondary: [],
  experience_years: 8,
  seniority: "Senior",
  domains: [],
  preferences: { locations: ["San Francisco"], remote: false, min_salary: null, company_sizes: [], country: "US" },
  career_intent: null,
  dealbreakers: [],
  problem_solving_stories: [],
  technical_depth: [],
  resume_json: null,
  created_at: "",
  updated_at: "",
};

function seedJobs(db: Database, n: number) {
  const stmt = db.query(
    "INSERT INTO jobs (source, source_id, title, location, posted_at, status) VALUES ('linkedin', ?, ?, ?, ?, 'discovered')"
  );
  const tx = db.transaction((count: number) => {
    for (let i = 0; i < count; i++) {
      const isMatch = i % 3 === 0;
      stmt.run(
        `j${i}`,
        isMatch ? "Backend Engineer" : "Florist Apprentice",
        isMatch ? "San Francisco, CA" : "Tokyo, Japan",
        "2026-05-08T00:00:00Z",
      );
    }
  });
  tx(n);
}

const okDetail: ParsedJobDetail = {
  description: "desc",
  seniority: "Senior",
  employmentType: "Full-time",
  function: "Engineering",
  industry: "Software",
};

let tmpDir: string;

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "bq-int-")); });
afterEach(() => { shutdownManager(); rmSync(tmpDir, { recursive: true, force: true }); });

describe("pipeline integration: heuristic + detail fetch", () => {
  test("ranks 200 discovered jobs, fetches top N, leaves rest as discovered with scores", async () => {
    const db = freshDb();
    seedJobs(db, 200);
    db.query("UPDATE settings SET value = '20' WHERE key = 'top_n_detail_fetch'").run();

    const adapter = { fetchDetails: mock(async () => okDetail) } as unknown as LinkedInAdapter;
    const q = new DetailFetchQueue({
      db,
      adapter,
      dataPath: join(tmpDir, "queue.db"),
      queueName: "integration",
      rateLimitMs: 1,
    });

    const result = await runHeuristicAndQueueDetails(db, profile, q);
    expect(result.scored).toBe(200);
    expect(result.queued).toBe(20);

    const counts = db.query(
      "SELECT status, COUNT(*) as c FROM jobs GROUP BY status"
    ).all() as { status: string; c: number }[];
    const statusMap = Object.fromEntries(counts.map(r => [r.status, r.c]));
    expect(statusMap.ready_for_scoring).toBe(20);
    expect(statusMap.discovered).toBe(180);
    expect(statusMap.queued ?? 0).toBe(0);
    expect(statusMap.fetching ?? 0).toBe(0);

    const scoredCount = (db.query("SELECT COUNT(*) as c FROM jobs WHERE heuristic_score IS NOT NULL").get() as any).c;
    expect(scoredCount).toBe(200);

    await q.close();
  });
});
