import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { shutdownManager } from "bunqueue/client";
import { runScoringPipeline, type ScoreEvent } from "../scoring-pipeline";
import type { FitResult, Profile } from "../../shared/types";
import { getJobFeed } from "../job-store";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/002_enrichment_questions_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/003_generated_queries_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/004_job_status_index.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/005_feed_filters_dealbreakers.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/006_profile_resume_json.sql"), "utf-8"),
].join("\n");

const profile: Profile = {
  id: 1,
  roles: ["Backend Engineer"],
  skills_primary: ["TypeScript"],
  skills_secondary: ["React"],
  experience_years: 9,
  seniority: "Staff",
  domains: ["Developer Tools"],
  preferences: {
    locations: ["San Francisco"],
    remote: true,
    min_salary: null,
    company_sizes: [],
    country: "US",
  },
  career_intent: "Backend platform work",
  dealbreakers: ["No onsite-only"],
  problem_solving_stories: ["Improved queue reliability"],
  technical_depth: ["Distributed systems"],
  resume_json: null,
  created_at: "",
  updated_at: "",
};

const fitResult: FitResult = {
  skills_score: 80,
  seniority_score: 60,
  domain_score: 70,
  location_score: 90,
  overqualified: true,
  matches: [{ skill: "TypeScript", type: "exact", context: "Strong TypeScript background." }],
  gaps: [{ skill: "Kubernetes", type: "partial", context: "Adjacent infrastructure experience only." }],
  dealbreaker_violations: [
    { dealbreaker: "No onsite-only", reason: "Job requires office attendance." },
  ],
  summary: "Good match with a modest platform gap.",
};

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

function seedProfile(db: Database): void {
  db.query(
    `INSERT INTO profiles (
      id, roles, skills_primary, skills_secondary, experience_years, seniority, domains, preferences,
      career_intent, dealbreakers, problem_solving_stories, technical_depth, resume_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    profile.id,
    JSON.stringify(profile.roles),
    JSON.stringify(profile.skills_primary),
    JSON.stringify(profile.skills_secondary),
    profile.experience_years,
    profile.seniority,
    JSON.stringify(profile.domains),
    JSON.stringify(profile.preferences),
    profile.career_intent,
    JSON.stringify(profile.dealbreakers),
    JSON.stringify(profile.problem_solving_stories),
    JSON.stringify(profile.technical_depth),
    "seed resume text",
  );
}

function seedReadyJob(db: Database): number {
  db.query(
    `INSERT INTO jobs (
      source, source_id, title, company, location, status, description,
      seniority_level, employment_type, job_function, industry
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "linkedin",
    "job-1",
    "Backend Engineer",
    "Acme",
    "San Francisco, CA",
    "ready_for_scoring",
    "Build backend systems.",
    "Junior",
    "Full-time",
    "Engineering",
    "Software",
  );

  return (db.query("SELECT id FROM jobs WHERE source_id = 'job-1'").get() as { id: number }).id;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "bq-score-"));
});

afterEach(() => {
  shutdownManager();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runScoringPipeline", () => {
  test("persists score, reasoning, status transition, and progressive score event", async () => {
    const db = freshDb();
    seedProfile(db);
    const jobId = seedReadyJob(db);
    const events: ScoreEvent[] = [];
    const scorer = mock(async () => ({
      result: fitResult,
      prompt: "prompt text",
      rawResponse: JSON.stringify(fitResult),
      model: "gemini-2.5-flash",
    }));

    const result = await runScoringPipeline({
      db,
      profile,
      resumeText: "seed resume text",
      scorer,
      emit: (event) => events.push(event),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-scoring-pipeline",
    });

    expect(result.scored).toBe(1);
    expect(result.failed).toBe(0);
    expect(scorer).toHaveBeenCalledTimes(1);

    const statusRow = db.query("SELECT status FROM jobs WHERE id = ?").get(jobId) as { status: string };
    expect(statusRow.status).toBe("ready");

    const scoreRow = db.query(
      "SELECT skills_score, seniority_score, domain_score, location_score, composite, overqualified, dealbreaker_violations FROM scores WHERE job_id = ?"
    ).get(jobId) as any;
    expect(scoreRow.skills_score).toBe(80);
    expect(scoreRow.seniority_score).toBe(60);
    expect(scoreRow.domain_score).toBe(70);
    expect(scoreRow.location_score).toBe(90);
    expect(scoreRow.composite).toBe(77);
    expect(scoreRow.overqualified).toBe(1);
    expect(JSON.parse(scoreRow.dealbreaker_violations)).toEqual([
      { dealbreaker: "No onsite-only", reason: "Job requires office attendance." },
    ]);

    const reasoningRow = db.query(
      "SELECT prompt, response, model FROM llm_reasoning WHERE job_id = ?"
    ).get(jobId) as any;
    expect(reasoningRow.prompt).toBe("prompt text");
    expect(reasoningRow.response).toContain("\"skills_score\":80");
    expect(reasoningRow.model).toBe("gemini-2.5-flash");

    expect(events.some((event) => event.type === "score:queued")).toBe(true);
    expect(events.some((event) => event.type === "score:scoring")).toBe(true);
    expect(events.some((event) => event.type === "score:ready" && event.payload.jobId === jobId)).toBe(true);
    expect(events.some((event) => event.type === "score:complete")).toBe(true);

    const feed = getJobFeed(db, { limit: 10, offset: 0 });
    expect(feed.jobs[0]?.weighted_composite).toBe(77);
    expect(feed.jobs[0]?.score_group).toBe("Good");
    expect(feed.jobs[0]?.overqualified).toBe(true);
    expect(feed.jobs[0]?.dealbreaker_violations).toEqual([
      { dealbreaker: "No onsite-only", reason: "Job requires office attendance." },
    ]);
  });
});
