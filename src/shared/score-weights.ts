import type { FitWeights, ScoreGroup } from "./types";

export type FitWeightKey = keyof FitWeights;

export type ScoreDimensions = {
  skills: number;
  seniority: number;
  domain: number;
  location: number;
};

export const DEFAULT_FIT_WEIGHTS: FitWeights = {
  skills: 40,
  seniority: 20,
  domain: 15,
  location: 25,
};

export const FIT_WEIGHT_KEYS: FitWeightKey[] = ["skills", "seniority", "domain", "location"];

export function composite(
  dimensions: ScoreDimensions,
  weights: FitWeights = DEFAULT_FIT_WEIGHTS,
): number {
  return Number((
    (
      dimensions.skills * weights.skills
      + dimensions.seniority * weights.seniority
      + dimensions.domain * weights.domain
      + dimensions.location * weights.location
    ) / 100
  ).toFixed(2));
}

export function adjustWeights(
  current: FitWeights,
  changedKey: FitWeightKey,
  nextValue: number,
): FitWeights {
  const target = clampWeight(nextValue);
  const remaining = 100 - target;
  const otherKeys = FIT_WEIGHT_KEYS.filter((key) => key !== changedKey);

  const currentOtherTotal = otherKeys.reduce((sum, key) => sum + clampWeight(current[key]), 0);
  const ratioSource = currentOtherTotal > 0 ? current : DEFAULT_FIT_WEIGHTS;
  const ratioTotal = otherKeys.reduce((sum, key) => sum + ratioSource[key], 0);
  const adjusted = { ...current, [changedKey]: target } as FitWeights;

  if (remaining === 0) {
    for (const key of otherKeys) adjusted[key] = 0;
    return adjusted;
  }

  const allocations = otherKeys.map((key) => {
    const raw = ratioTotal > 0
      ? (ratioSource[key] / ratioTotal) * remaining
      : remaining / otherKeys.length;
    const floor = Math.floor(raw);
    return { key, floor, remainder: raw - floor };
  });

  let assigned = allocations.reduce((sum, item) => sum + item.floor, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || FIT_WEIGHT_KEYS.indexOf(a.key) - FIT_WEIGHT_KEYS.indexOf(b.key));

  for (const item of allocations) {
    adjusted[item.key] = item.floor;
  }

  for (const item of allocations) {
    if (assigned >= remaining) break;
    adjusted[item.key] += 1;
    assigned += 1;
  }

  return adjusted;
}

export function scoreGroup(score: number): ScoreGroup {
  if (score >= 80) return "Top";
  if (score >= 65) return "Good";
  return "Others";
}

export function dimensionsFromScoreFields(scores: {
  skills_score: number;
  seniority_score: number;
  domain_score: number;
  location_score: number;
}): ScoreDimensions {
  return {
    skills: scores.skills_score,
    seniority: scores.seniority_score,
    domain: scores.domain_score,
    location: scores.location_score,
  };
}

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
