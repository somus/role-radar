import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { invalidateScoresAndRequeueJobs } from "../scoring-state";

const migrationsDir = join(import.meta.dir, "../../../migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf-8"))
  .join("\n");

describe("invalidateScoresAndRequeueJobs", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
    db.query(
      `INSERT INTO profiles (
        id, roles, skills_primary, skills_secondary, experience_years, seniority, domains, preferences, resume_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1,
      JSON.stringify(["Backend Engineer"]),
      JSON.stringify(["TypeScript"]),
      JSON.stringify([]),
      8,
      "Senior",
      JSON.stringify(["Fintech"]),
      JSON.stringify({ locations: ["Remote"], remote: true, min_salary: null, company_sizes: [], country: "US" }),
      "resume text",
    );

    db.query(
      `INSERT INTO jobs (id, source, source_id, title, status, description)
       VALUES
       (1, 'linkedin', 'ready', 'Ready', 'ready', 'desc'),
       (2, 'linkedin', 'score_failed', 'Score Failed', 'score_failed', 'desc'),
       (3, 'linkedin', 'scoring', 'Scoring', 'scoring', 'desc'),
       (4, 'linkedin', 'discovered', 'Discovered', 'discovered', NULL),
       (5, 'linkedin', 'fetch_failed', 'Fetch Failed', 'fetch_failed', NULL)`
    ).run();

    db.query(
      `INSERT INTO scores (
        job_id, profile_id, skills_score, seniority_score, domain_score, location_score, composite, overqualified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1, 1, 80, 70, 60, 90, 77, 0,
      2, 1, 70, 60, 50, 80, 67, 0,
    );

    db.query(
      "INSERT INTO llm_reasoning (job_id, profile_id, prompt, response, model) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)"
    ).run(
      1, 1, "prompt 1", "response 1", "gemini-2.5-flash",
      2, 1, "prompt 2", "response 2", "gemini-2.5-flash",
    );
  });

  test("clears scores and requeues already-detailed jobs", () => {
    const result = invalidateScoresAndRequeueJobs(db, 1);

    expect(result.deletedScores).toBe(2);
    expect(result.deletedReasoning).toBe(2);
    expect(result.requeuedJobs).toBe(3);

    const scoreCount = (db.query("SELECT COUNT(*) as c FROM scores").get() as { c: number }).c;
    const reasoningCount = (db.query("SELECT COUNT(*) as c FROM llm_reasoning").get() as { c: number }).c;
    expect(scoreCount).toBe(0);
    expect(reasoningCount).toBe(0);

    const statuses = db.query("SELECT id, status FROM jobs ORDER BY id").all() as Array<{ id: number; status: string }>;
    expect(statuses).toEqual([
      { id: 1, status: "ready_for_scoring" },
      { id: 2, status: "ready_for_scoring" },
      { id: 3, status: "ready_for_scoring" },
      { id: 4, status: "discovered" },
      { id: 5, status: "fetch_failed" },
    ]);
  });
});
