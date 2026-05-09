import { describe, test, expect } from "bun:test";
import { scoreJob, selectTopN } from "../heuristic-scorer";
import type { Profile, Job } from "../../shared/types";

const baseProfile: Profile = {
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
  created_at: "",
  updated_at: "",
};

const NOW = new Date("2026-05-09T00:00:00Z");

function mkJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    source: "linkedin",
    source_id: "abc",
    title: "Backend Engineer",
    company: "Acme",
    location: "San Francisco, CA",
    url: null,
    posted_at: NOW.toISOString(),
    status: "discovered",
    description: null,
    seniority_level: null,
    employment_type: null,
    job_function: null,
    industry: null,
    heuristic_score: null,
    resume_generated: false,
    is_new: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("scoreJob — title similarity", () => {
  test("exact title match scores higher than unrelated", () => {
    const exact = scoreJob(mkJob({ title: "Backend Engineer" }), baseProfile, { now: NOW });
    const unrelated = scoreJob(mkJob({ title: "Florist Apprentice" }), baseProfile, { now: NOW });
    expect(exact).toBeGreaterThan(unrelated);
  });

  test("partial title match sits between exact and unrelated", () => {
    const exact = scoreJob(mkJob({ title: "Backend Engineer" }), baseProfile, { now: NOW });
    const partial = scoreJob(mkJob({ title: "Frontend Engineer" }), baseProfile, { now: NOW });
    const unrelated = scoreJob(mkJob({ title: "Florist Apprentice" }), baseProfile, { now: NOW });
    expect(partial).toBeLessThan(exact);
    expect(partial).toBeGreaterThan(unrelated);
  });
});

describe("selectTopN", () => {
  test("returns n highest-scoring jobs in stable order", () => {
    const jobs: Job[] = [
      mkJob({ id: 1, source_id: "1", title: "Florist", location: "Tokyo, Japan" }),
      mkJob({ id: 2, source_id: "2", title: "Backend Engineer", location: "San Francisco, CA" }),
      mkJob({ id: 3, source_id: "3", title: "Frontend Engineer", location: "Austin, US" }),
    ];
    const top = selectTopN(jobs, baseProfile, 2, { now: NOW });
    expect(top.map(j => j.source_id)).toEqual(["2", "3"]);
  });

  test("returns at most n jobs when input larger", () => {
    const jobs: Job[] = Array.from({ length: 20 }, (_, i) =>
      mkJob({ id: i, source_id: String(i), title: i % 2 === 0 ? "Backend Engineer" : "Florist Apprentice" })
    );
    const top = selectTopN(jobs, baseProfile, 5, { now: NOW });
    expect(top).toHaveLength(5);
  });

  test("returns ≤n when fewer jobs available", () => {
    const jobs: Job[] = [mkJob({ id: 1, source_id: "1" })];
    const top = selectTopN(jobs, baseProfile, 50, { now: NOW });
    expect(top).toHaveLength(1);
  });

  test("ranking is deterministic — ties broken by source_id ascending", () => {
    const jobs: Job[] = [
      mkJob({ id: 1, source_id: "z" }),
      mkJob({ id: 2, source_id: "a" }),
      mkJob({ id: 3, source_id: "m" }),
    ];
    const a = selectTopN(jobs, baseProfile, 3, { now: NOW });
    const b = selectTopN([...jobs].reverse(), baseProfile, 3, { now: NOW });
    expect(a.map(j => j.source_id)).toEqual(["a", "m", "z"]);
    expect(b.map(j => j.source_id)).toEqual(["a", "m", "z"]);
  });
});

describe("scoreJob — recency", () => {
  test("recent posting outscores old posting (else equal)", () => {
    const fresh = scoreJob(mkJob({ posted_at: "2026-05-08T00:00:00Z" }), baseProfile, { now: NOW });
    const stale = scoreJob(mkJob({ posted_at: "2026-04-15T00:00:00Z" }), baseProfile, { now: NOW });
    expect(fresh).toBeGreaterThan(stale);
  });

  test("missing posted_at yields neutral recency (between fresh and stale)", () => {
    const fresh = scoreJob(mkJob({ posted_at: "2026-05-09T00:00:00Z" }), baseProfile, { now: NOW });
    const missing = scoreJob(mkJob({ posted_at: null }), baseProfile, { now: NOW });
    const stale = scoreJob(mkJob({ posted_at: "2026-01-01T00:00:00Z" }), baseProfile, { now: NOW });
    expect(missing).toBeLessThan(fresh);
    expect(missing).toBeGreaterThan(stale);
  });
});

describe("scoreJob — location match", () => {
  test("preferred-city location adds vs unrelated city", () => {
    const sf = scoreJob(mkJob({ location: "San Francisco, CA" }), baseProfile, { now: NOW });
    const tokyo = scoreJob(mkJob({ location: "Tokyo, Japan" }), baseProfile, { now: NOW });
    expect(sf).toBeGreaterThan(tokyo);
  });

  test("remote profile + remote job adds; remote profile + onsite does not", () => {
    const remoteProfile: Profile = { ...baseProfile, preferences: { ...baseProfile.preferences, remote: true, locations: [] } };
    const remoteJob = scoreJob(mkJob({ location: "Remote, USA" }), remoteProfile, { now: NOW });
    const onsiteJob = scoreJob(mkJob({ location: "Tokyo, Japan" }), remoteProfile, { now: NOW });
    expect(remoteJob).toBeGreaterThan(onsiteJob);
  });

  test("country fallback when city not listed", () => {
    const sameCountry = scoreJob(mkJob({ location: "Austin, US" }), baseProfile, { now: NOW });
    const otherCountry = scoreJob(mkJob({ location: "Austin, UK" }), baseProfile, { now: NOW });
    expect(sameCountry).toBeGreaterThan(otherCountry);
  });
});
