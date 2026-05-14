import { describe, expect, test } from "bun:test";
import { normalizePostedAt } from "../posted-at-normalizer";

const FIXED_NOW = Date.UTC(2026, 4, 13, 12, 0, 0);
const ONE_DAY = 24 * 60 * 60 * 1000;

describe("normalizePostedAt", () => {
  test("ISO timestamp → exact", () => {
    const r = normalizePostedAt("2026-05-10T08:30:00Z", FIXED_NOW);
    expect(r.confidence).toBe("exact");
    expect(r.postedAtTs).toBe(Date.UTC(2026, 4, 10, 8, 30, 0));
  });

  test("ISO date only → exact", () => {
    const r = normalizePostedAt("2026-05-10", FIXED_NOW);
    expect(r.confidence).toBe("exact");
    expect(r.postedAtTs).toBe(Date.UTC(2026, 4, 10, 0, 0, 0));
  });

  test("'Just now' → relative, near fetched", () => {
    const r = normalizePostedAt("Just now", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBe(FIXED_NOW);
  });

  test("'Posted today' → relative", () => {
    const r = normalizePostedAt("Posted today", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBeLessThan(FIXED_NOW);
    expect(r.postedAtTs!).toBeGreaterThan(FIXED_NOW - ONE_DAY);
  });

  test("'yesterday' → relative, ~1 day back", () => {
    const r = normalizePostedAt("yesterday", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBe(FIXED_NOW - ONE_DAY);
  });

  test("'2 days ago' → relative, between 2.5 and 1.5 days", () => {
    const r = normalizePostedAt("2 days ago", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    const expected = FIXED_NOW - 2 * ONE_DAY - ONE_DAY / 2;
    expect(r.postedAtTs).toBe(expected);
  });

  test("'3 hours ago'", () => {
    const r = normalizePostedAt("3 hours ago", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBeLessThan(FIXED_NOW);
    expect(r.postedAtTs!).toBeGreaterThan(FIXED_NOW - 4 * 60 * 60 * 1000);
  });

  test("'5 mins ago'", () => {
    const r = normalizePostedAt("5 mins ago", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBeLessThan(FIXED_NOW);
  });

  test("'1 week ago' ~7 days back", () => {
    const r = normalizePostedAt("1 week ago", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBe(FIXED_NOW - 7 * ONE_DAY - 7 * ONE_DAY / 2);
  });

  test("'30+ days ago' (linkedin style with +)", () => {
    const r = normalizePostedAt("30+ days ago", FIXED_NOW);
    expect(r.confidence).toBe("relative");
    expect(r.postedAtTs).toBe(FIXED_NOW - 30 * ONE_DAY - ONE_DAY / 2);
  });

  test("'12 May 2026' → estimated", () => {
    const r = normalizePostedAt("12 May 2026", FIXED_NOW);
    expect(r.confidence).toBe("estimated");
    expect(r.postedAtTs).toBe(Date.UTC(2026, 4, 12, 12, 0, 0));
  });

  test("'May 12, 2026' → estimated", () => {
    const r = normalizePostedAt("May 12, 2026", FIXED_NOW);
    expect(r.confidence).toBe("estimated");
    expect(r.postedAtTs).toBe(Date.UTC(2026, 4, 12, 12, 0, 0));
  });

  test("'12 May' (no year, recent) → estimated, current year", () => {
    const r = normalizePostedAt("12 May", FIXED_NOW);
    expect(r.confidence).toBe("estimated");
    expect(r.postedAtTs).toBe(Date.UTC(2026, 4, 12, 12, 0, 0));
  });

  test("'Posted on 1 Dec' (year not given, would be future → rolls back)", () => {
    const r = normalizePostedAt("Posted on 1 Dec", FIXED_NOW);
    expect(r.confidence).toBe("estimated");
    expect(r.postedAtTs).toBe(Date.UTC(2025, 11, 1, 12, 0, 0));
  });

  test("'12 May' (no year, future-ish) rolls to prior year", () => {
    const r = normalizePostedAt("31 December", FIXED_NOW);
    expect(r.confidence).toBe("estimated");
    expect(r.postedAtTs).toBe(Date.UTC(2025, 11, 31, 12, 0, 0));
  });

  test("empty string → missing", () => {
    const r = normalizePostedAt("", FIXED_NOW);
    expect(r.confidence).toBe("missing");
    expect(r.postedAtTs).toBeNull();
  });

  test("null → missing", () => {
    const r = normalizePostedAt(null, FIXED_NOW);
    expect(r.confidence).toBe("missing");
    expect(r.postedAtTs).toBeNull();
  });

  test("gibberish → missing", () => {
    const r = normalizePostedAt("xyzzy123", FIXED_NOW);
    expect(r.confidence).toBe("missing");
    expect(r.postedAtTs).toBeNull();
  });
});
