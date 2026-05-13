import { describe, expect, test } from "bun:test";
import { applyWeightsToJobFeed } from "./job-feed-rerank";
import type { FitWeights, JobFeedItem } from "../shared/types";

function makeJob(overrides: Partial<JobFeedItem>): JobFeedItem {
  return {
    id: 1,
    source: "linkedin",
    source_id: "job-1",
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    url: null,
    posted_at: null,
    status: "ready",
    description: "desc",
    seniority_level: "Senior",
    employment_type: "Full-time",
    job_function: "Engineering",
    industry: "Software",
    heuristic_score: null,
    resume_generated: false,
    is_new: false,
    created_at: "",
    updated_at: "",
    skills_score: 80,
    seniority_score: 70,
    domain_score: 60,
    location_score: 50,
    composite: 72.5,
    weighted_composite: 72.5,
    score_group: "Good",
    overqualified: false,
    matches: [],
    gaps: [],
    summary: null,
    dealbreaker_violations: [],
    ...overrides,
  };
}

describe("applyWeightsToJobFeed", () => {
  test("recomputes composite scores, groups, and ordering", () => {
    const weights: FitWeights = {
      skills: 0,
      seniority: 0,
      domain: 0,
      location: 100,
    };

    const jobs = applyWeightsToJobFeed([
      makeJob({ id: 1, source_id: "skills-heavy", skills_score: 95, location_score: 50 }),
      makeJob({ id: 2, source_id: "location-heavy", skills_score: 60, location_score: 90 }),
      makeJob({ id: 3, source_id: "low", skills_score: 30, location_score: 40 }),
    ], weights);

    expect(jobs.map((job) => [job.source_id, job.weighted_composite, job.score_group])).toEqual([
      ["location-heavy", 90, "Top"],
      ["skills-heavy", 50, "Others"],
      ["low", 40, "Others"],
    ]);
  });

  test("leaves unscored pending and failed jobs ungrouped", () => {
    const weights: FitWeights = {
      skills: 100,
      seniority: 0,
      domain: 0,
      location: 0,
    };

    const jobs = applyWeightsToJobFeed([
      makeJob({ id: 1, source_id: "scored", skills_score: 90 }),
      makeJob({
        id: 2,
        source_id: "pending",
        status: "scoring",
        skills_score: null,
        seniority_score: null,
        domain_score: null,
        location_score: null,
        composite: null,
        weighted_composite: null,
        score_group: null,
      }),
      makeJob({
        id: 3,
        source_id: "failed",
        status: "score_failed",
        skills_score: null,
        seniority_score: null,
        domain_score: null,
        location_score: null,
        composite: null,
        weighted_composite: null,
        score_group: null,
      }),
    ], weights);

    expect(jobs[0]?.source_id).toBe("scored");
    expect(jobs[0]?.weighted_composite).toBe(90);
    expect(jobs[0]?.score_group).toBe("Top");
    expect(jobs.find((job) => job.source_id === "pending")?.score_group).toBeNull();
    expect(jobs.find((job) => job.source_id === "failed")?.score_group).toBeNull();
  });
});
