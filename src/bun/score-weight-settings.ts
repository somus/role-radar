import type { Database } from "bun:sqlite";
import type { FitWeights } from "../shared/types";
import { DEFAULT_FIT_WEIGHTS, FIT_WEIGHT_KEYS } from "../shared/score-weights";

const SETTING_KEYS: Record<keyof FitWeights, string> = {
  skills: "weights_skills",
  seniority: "weights_seniority",
  domain: "weights_domain",
  location: "weights_location",
};

export function getScoreWeights(db: Database): FitWeights {
  const rows = db.query(
    "SELECT key, value FROM settings WHERE key IN ('weights_skills', 'weights_seniority', 'weights_domain', 'weights_location')"
  ).all() as { key: string; value: string }[];
  const map = new Map(rows.map((row) => [row.key, Number(row.value)]));

  const weights = {
    skills: validOrDefault(map.get(SETTING_KEYS.skills), DEFAULT_FIT_WEIGHTS.skills),
    seniority: validOrDefault(map.get(SETTING_KEYS.seniority), DEFAULT_FIT_WEIGHTS.seniority),
    domain: validOrDefault(map.get(SETTING_KEYS.domain), DEFAULT_FIT_WEIGHTS.domain),
    location: validOrDefault(map.get(SETTING_KEYS.location), DEFAULT_FIT_WEIGHTS.location),
  };

  try {
    validateScoreWeights(weights);
    return weights;
  } catch {
    return DEFAULT_FIT_WEIGHTS;
  }
}

export function updateScoreWeights(db: Database, weights: FitWeights): FitWeights {
  validateScoreWeights(weights);

  const tx = db.transaction((next: FitWeights) => {
    const stmt = db.query(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    for (const key of FIT_WEIGHT_KEYS) {
      stmt.run(SETTING_KEYS[key], String(next[key]));
    }
  });
  tx(weights);

  return getScoreWeights(db);
}

export function validateScoreWeights(weights: FitWeights): void {
  for (const key of FIT_WEIGHT_KEYS) {
    const value = weights[key];
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error("Score weights must be between 0 and 100");
    }
  }

  const total = FIT_WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total !== 100) {
    throw new Error("Score weights must sum to 100");
  }
}

function validOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}
