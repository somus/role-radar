import { describe, expect, test } from "bun:test";
import { normalizeFeedFilters } from "../job-store";
import { DEFAULT_JOB_FEED_FILTERS } from "../../shared/types";

describe("normalizeFeedFilters", () => {
  test("undefined falls back to defaults", () => {
    expect(normalizeFeedFilters(undefined)).toEqual(DEFAULT_JOB_FEED_FILTERS);
  });

  test("empty enabledSources falls back to default list", () => {
    const result = normalizeFeedFilters({
      minScore: 50,
      hideDealbreakers: false,
      enabledSources: [],
      sortMode: "best_match",
    });
    expect(result.enabledSources).toEqual(DEFAULT_JOB_FEED_FILTERS.enabledSources);
  });

  test("invalid sortMode falls back to best_match", () => {
    const result = normalizeFeedFilters({
      minScore: 50,
      hideDealbreakers: false,
      enabledSources: ["linkedin"],
      sortMode: "garbage" as any,
    });
    expect(result.sortMode).toBe("best_match");
  });

  test("accepts most_recent sortMode", () => {
    const result = normalizeFeedFilters({
      minScore: 0,
      hideDealbreakers: false,
      enabledSources: ["linkedin"],
      sortMode: "most_recent",
    });
    expect(result.sortMode).toBe("most_recent");
  });

  test("preserves enabledSources when array is non-empty", () => {
    const result = normalizeFeedFilters({
      minScore: 0,
      hideDealbreakers: false,
      enabledSources: ["naukri", "shine"],
      sortMode: "best_match",
    });
    expect(result.enabledSources).toEqual(["naukri", "shine"]);
  });

  test("clamps minScore to 0-100 range", () => {
    expect(
      normalizeFeedFilters({
        minScore: 150,
        hideDealbreakers: false,
        enabledSources: ["linkedin"],
        sortMode: "best_match",
      }).minScore,
    ).toBe(100);
    expect(
      normalizeFeedFilters({
        minScore: -10,
        hideDealbreakers: false,
        enabledSources: ["linkedin"],
        sortMode: "best_match",
      }).minScore,
    ).toBe(0);
  });
});
