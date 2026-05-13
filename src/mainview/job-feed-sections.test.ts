import { describe, test, expect } from "bun:test";
import { buildJobFeedSections } from "./job-feed-sections";
import type { JobFeedItem } from "../shared/types";

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
    location_score: 90,
    composite: 77,
    weighted_composite: 77,
    score_group: "Good",
    overqualified: false,
    matches: [],
    gaps: [],
    summary: null,
    ...overrides,
  };
}

describe("buildJobFeedSections", () => {
  test("keeps scored groups ordered and splits pending from failed jobs", () => {
    const sections = buildJobFeedSections([
      makeJob({ id: 1, source_id: "top", score_group: "Top", weighted_composite: 91 }),
      makeJob({ id: 2, source_id: "good", score_group: "Good", weighted_composite: 72 }),
      makeJob({ id: 3, source_id: "other", score_group: "Others", weighted_composite: 40 }),
      makeJob({ id: 4, source_id: "pending", status: "scoring", score_group: null, weighted_composite: null, composite: null, skills_score: null, seniority_score: null, domain_score: null, location_score: null }),
      makeJob({ id: 5, source_id: "failed", status: "score_failed", score_group: null, weighted_composite: null, composite: null, skills_score: null, seniority_score: null, domain_score: null, location_score: null }),
    ]);

    expect(sections.map((section) => section.title)).toEqual([
      "Top Matches",
      "Good Matches",
      "Others",
      "Still Processing",
      "Needs Attention",
    ]);
    expect(sections[3]?.jobs.map((job) => job.source_id)).toEqual(["pending"]);
    expect(sections[4]?.jobs.map((job) => job.source_id)).toEqual(["failed"]);
  });
});
