import { describe, expect, test } from "bun:test";
import { applyJobFeedFilters, reconcileSelectedJobId } from "./job-feed-filters";
import type { JobFeedFilters, JobFeedItem } from "../shared/types";

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
    dealbreaker_violations: [],
    ...overrides,
  };
}

const defaults: JobFeedFilters = {
  minScore: 0,
  hideDealbreakers: false,
};

describe("applyJobFeedFilters", () => {
  test("hides scored jobs below the minimum score and leaves unscored work visible", () => {
    const jobs = applyJobFeedFilters([
      makeJob({ id: 1, source_id: "top", weighted_composite: 86 }),
      makeJob({ id: 2, source_id: "low", weighted_composite: 55 }),
      makeJob({
        id: 3,
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
    ], { ...defaults, minScore: 65 });

    expect(jobs.map((job) => job.source_id)).toEqual(["top", "pending"]);
  });

  test("hides jobs with dealbreaker violations when requested", () => {
    const jobs = applyJobFeedFilters([
      makeJob({ id: 1, source_id: "clean", weighted_composite: 86 }),
      makeJob({
        id: 2,
        source_id: "onsite",
        weighted_composite: 92,
        dealbreaker_violations: [
          { dealbreaker: "no onsite", reason: "Requires three days in office." },
        ],
      }),
    ], { ...defaults, hideDealbreakers: true });

    expect(jobs.map((job) => job.source_id)).toEqual(["clean"]);
  });
});

describe("reconcileSelectedJobId", () => {
  test("keeps the selected job when it is still visible", () => {
    const jobs = [
      makeJob({ id: 1, source_id: "first" }),
      makeJob({ id: 2, source_id: "selected" }),
    ];

    expect(reconcileSelectedJobId(2, jobs)).toBe(2);
  });

  test("falls back to the first visible job when selection is hidden", () => {
    const jobs = [
      makeJob({ id: 3, source_id: "first-visible" }),
      makeJob({ id: 4, source_id: "second-visible" }),
    ];

    expect(reconcileSelectedJobId(2, jobs)).toBe(3);
  });

  test("clears selection when no jobs are visible", () => {
    expect(reconcileSelectedJobId(2, [])).toBeNull();
  });
});
