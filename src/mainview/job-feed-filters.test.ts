import { describe, expect, test } from "bun:test";
import { applyJobFeedFilters, reconcileSelectedJobId } from "./job-feed-filters";
import { DEFAULT_JOB_FEED_FILTERS, type JobFeedFilters, type JobFeedItem } from "../shared/types";
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

const defaults: JobFeedFilters = DEFAULT_JOB_FEED_FILTERS;

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
