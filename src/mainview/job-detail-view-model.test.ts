import { describe, expect, test } from "bun:test";
import { buildDimensionRows, isSelectedDetailCurrent, scoreTone } from "./job-detail-view-model";
import type { JobDetail } from "../shared/types";
import { makeTestJobFeedItem } from "./test-utils";

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return makeTestJobFeedItem({
    url: null,
    description: "Build APIs.",
    seniority_level: "Senior",
    employment_type: "Full-time",
    job_function: "Engineering",
    industry: "Software",
    created_at: "",
    updated_at: "",
    skills_score: 84,
    seniority_score: 70,
    domain_score: 49,
    location_score: null,
    composite: 74,
    weighted_composite: 74,
    score_group: "Good",
    ...overrides,
  });
}

describe("scoreTone", () => {
  test("maps score ranges to green, yellow, and red tones", () => {
    expect(scoreTone(80)).toBe("green");
    expect(scoreTone(65)).toBe("yellow");
    expect(scoreTone(64)).toBe("red");
    expect(scoreTone(null)).toBe("muted");
  });
});

describe("buildDimensionRows", () => {
  test("builds ordered dimension rows with tones", () => {
    const rows = buildDimensionRows(makeDetail());

    expect(rows.map((row) => [row.key, row.label, row.score, row.tone])).toEqual([
      ["skills", "Skills", 84, "green"],
      ["seniority", "Seniority", 70, "yellow"],
      ["domain", "Domain", 49, "red"],
      ["location", "Location", null, "muted"],
    ]);
  });
});

describe("isSelectedDetailCurrent", () => {
  test("only treats detail as current when ids match", () => {
    expect(isSelectedDetailCurrent(1, makeDetail({ id: 1 }))).toBe(true);
    expect(isSelectedDetailCurrent(2, makeDetail({ id: 1 }))).toBe(false);
    expect(isSelectedDetailCurrent(1, null)).toBe(false);
    expect(isSelectedDetailCurrent(null, makeDetail({ id: 1 }))).toBe(false);
  });
});
