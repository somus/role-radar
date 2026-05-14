import { describe, expect, test } from "bun:test";
import { DEFAULT_FIT_WEIGHTS } from "../shared/score-weights";
import { DEFAULT_JOB_FEED_FILTERS, type JobDetail, type JobFeedItem } from "../shared/types";
import { buildFeedStatusSummary, buildFilterChips, buildJobDecisionSummary, buildJobNextAction } from "./feed-view-model";
import { makeTestJobFeedItem } from "./test-utils";

function makeJob(overrides: Partial<JobFeedItem>): JobFeedItem {
  return makeTestJobFeedItem({
    skills_score: 90,
    seniority_score: 80,
    domain_score: 70,
    location_score: 100,
    composite: 86,
    weighted_composite: 86,
    score_group: "Top",
    summary: "Strong fit",
    ...overrides,
  });
}

describe("buildFeedStatusSummary", () => {
  test("counts ready, pending, failed, new, and dealbreaker jobs", () => {
    const jobs = [
      makeJob({ id: 1, weighted_composite: 86, is_new: true }),
      makeJob({ id: 2, status: "fetching", weighted_composite: null, score_group: null }),
      makeJob({ id: 3, status: "score_failed", weighted_composite: null, score_group: null }),
      makeJob({ id: 4, dealbreaker_violations: [{ dealbreaker: "no onsite", reason: "Hybrid" }] }),
    ];

    expect(buildFeedStatusSummary(jobs, 20, 1)).toEqual({
      total: 20,
      ready: 2,
      pending: 1,
      failed: 1,
      newCount: 1,
      dealbreakerCount: 1,
    });
  });
});

describe("buildFilterChips", () => {
  test("returns chips only for active filters and customized weights", () => {
    expect(buildFilterChips(
      { ...DEFAULT_JOB_FEED_FILTERS, minScore: 70, hideDealbreakers: true },
      { ...DEFAULT_FIT_WEIGHTS, skills: 50, seniority: 10 },
    )).toEqual([
      { key: "min-score", label: "Score 70+", tone: "active" },
      { key: "dealbreakers", label: "Dealbreakers hidden", tone: "warning" },
      { key: "weight-skills", label: "Skills 50%", tone: "neutral" },
      { key: "weight-seniority", label: "Seniority 10%", tone: "neutral" },
    ]);
  });
});

describe("job decision helpers", () => {
  test("prioritizes dealbreakers over score optimism", () => {
    const job = makeJob({
      dealbreaker_violations: [{ dealbreaker: "no onsite", reason: "Requires office" }],
    }) as JobDetail;

    expect(buildJobNextAction(job)).toBe("Check constraint");
    expect(buildJobDecisionSummary(job)).toContain("hard constraint");
  });

  test("marks pending jobs as awaiting score", () => {
    const job = makeJob({ status: "scoring", weighted_composite: null, score_group: null }) as JobDetail;

    expect(buildJobNextAction(job)).toBe("Await score");
    expect(buildJobDecisionSummary(job)).toContain("still moving");
  });
});

