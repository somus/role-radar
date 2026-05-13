import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FIT_WEIGHTS,
  adjustWeights,
  composite,
  scoreGroup,
} from "./score-weights";

describe("composite", () => {
  const dimensions = {
    skills: 80,
    seniority: 60,
    domain: 70,
    location: 90,
  };

  test("matches manual weighted math with default weights", () => {
    expect(composite(dimensions)).toBe(77);
  });

  test("supports custom weights", () => {
    expect(composite(dimensions, {
      skills: 25,
      seniority: 25,
      domain: 25,
      location: 25,
    })).toBe(75);
  });

  test("allows zero weight dimensions", () => {
    expect(composite(dimensions, {
      skills: 0,
      seniority: 50,
      domain: 0,
      location: 50,
    })).toBe(75);
  });

  test("supports a single maxed dimension", () => {
    expect(composite(dimensions, {
      skills: 100,
      seniority: 0,
      domain: 0,
      location: 0,
    })).toBe(80);
  });
});

describe("adjustWeights", () => {
  test("proportionally adjusts other dimensions and preserves a total of 100", () => {
    const weights = adjustWeights(DEFAULT_FIT_WEIGHTS, "skills", 50);

    expect(weights).toEqual({
      skills: 50,
      seniority: 17,
      domain: 12,
      location: 21,
    });
    expect(sum(weights)).toBe(100);
  });

  test("allows a dimension to be zero", () => {
    const weights = adjustWeights(DEFAULT_FIT_WEIGHTS, "location", 0);

    expect(weights.location).toBe(0);
    expect(sum(weights)).toBe(100);
  });

  test("allows a single dimension to be maxed", () => {
    expect(adjustWeights(DEFAULT_FIT_WEIGHTS, "skills", 100)).toEqual({
      skills: 100,
      seniority: 0,
      domain: 0,
      location: 0,
    });
  });

  test("redistributes from a maxed dimension using default ratios", () => {
    expect(adjustWeights({
      skills: 100,
      seniority: 0,
      domain: 0,
      location: 0,
    }, "skills", 70)).toEqual({
      skills: 70,
      seniority: 10,
      domain: 8,
      location: 12,
    });
  });
});

describe("scoreGroup", () => {
  test("maps score thresholds to feed groups", () => {
    expect(scoreGroup(80)).toBe("Top");
    expect(scoreGroup(65)).toBe("Good");
    expect(scoreGroup(64.99)).toBe("Others");
  });
});

function sum(weights: typeof DEFAULT_FIT_WEIGHTS): number {
  return weights.skills + weights.seniority + weights.domain + weights.location;
}
