import { describe, test, expect } from "bun:test";
import { buildJobFeedSections } from "./job-feed-sections";
import type { JobFeedItem } from "../shared/types";
import { makeTestJobFeedItem } from "./test-utils";

function makeJob(overrides: Partial<JobFeedItem>): JobFeedItem {
  return makeTestJobFeedItem({
    url: null,
    description: "desc",
    seniority_level: "Senior",
    employment_type: "Full-time",
    job_function: "Engineering",
    industry: "Software",
    created_at: "",
    updated_at: "",
    ...overrides,
  });
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
      "Top Matches (80+)",
      "Good Matches (65-80)",
      "Others",
      "Still Processing",
      "Needs Attention",
    ]);
    expect(sections[3]?.jobs.map((job) => job.source_id)).toEqual(["pending"]);
    expect(sections[4]?.jobs.map((job) => job.source_id)).toEqual(["failed"]);
  });

  test("marks scored groups as sticky and exposes visible counts", () => {
    const sections = buildJobFeedSections([
      makeJob({ id: 1, source_id: "top-1", score_group: "Top", weighted_composite: 91 }),
      makeJob({ id: 2, source_id: "top-2", score_group: "Top", weighted_composite: 82 }),
      makeJob({ id: 3, source_id: "good", score_group: "Good", weighted_composite: 72 }),
    ]);

    expect(sections.map((section) => [section.title, section.count, section.sticky])).toEqual([
      ["Top Matches (80+)", 2, true],
      ["Good Matches (65-80)", 1, true],
    ]);
  });
});
