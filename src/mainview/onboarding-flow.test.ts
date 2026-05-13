import { describe, expect, test } from "bun:test";
import { buildOnboardingSteps, type OnboardingStepKey } from "./onboarding-flow";

describe("buildOnboardingSteps", () => {
  test("marks completed, current, and upcoming onboarding steps", () => {
    expect(buildOnboardingSteps("profile").map((step) => [step.key, step.state])).toEqual([
      ["api", "complete"],
      ["resume", "complete"],
      ["profile", "current"],
      ["enrichment", "upcoming"],
      ["search", "upcoming"],
    ]);
  });

  test("first step has no completed predecessors", () => {
    const states = buildOnboardingSteps("api").map((step) => step.state);
    expect(states).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  test("last step marks all predecessors complete", () => {
    const states = buildOnboardingSteps("search").map((step) => step.state);
    expect(states).toEqual(["complete", "complete", "complete", "complete", "current"]);
  });

  test("falls back to first step when current key is unknown", () => {
    const states = buildOnboardingSteps("bogus" as OnboardingStepKey).map((step) => step.state);
    expect(states).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  test("each step appears exactly once with stable label and description", () => {
    const steps = buildOnboardingSteps("enrichment");
    expect(steps.map((step) => step.key)).toEqual(["api", "resume", "profile", "enrichment", "search"]);
    for (const step of steps) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

