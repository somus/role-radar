import { describe, expect, test } from "bun:test";
import { buildDimensionRows, isSelectedDetailCurrent, scoreTone } from "./job-detail-view-model";
import type { JobDetail } from "../shared/types";

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
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
    description: "Build APIs.",
    seniority_level: "Senior",
    employment_type: "Full-time",
    job_function: "Engineering",
    industry: "Software",
    heuristic_score: null,
    resume_generated: false,
    is_new: false,
    created_at: "",
    updated_at: "",
    skills_score: 84,
    seniority_score: 70,
    domain_score: 49,
    location_score: null,
    composite: 74,
    weighted_composite: 74,
    score_group: "Good",
    overqualified: false,
    matches: [],
    gaps: [],
    summary: null,
    dealbreaker_violations: [],
    ...overrides,
  };
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
