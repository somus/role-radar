import type { Database } from "bun:sqlite";
import { DEFAULT_JOB_FEED_FILTERS, type JobFeedFilters } from "../shared/types";

const MIN_SCORE_KEY = "feed_min_score";
const HIDE_DEALBREAKERS_KEY = "feed_hide_dealbreakers";

export function getJobFeedFilters(db: Database): JobFeedFilters {
  const rows = db.query(
    "SELECT key, value FROM settings WHERE key IN ('feed_min_score', 'feed_hide_dealbreakers')",
  ).all() as { key: string; value: string }[];
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const minScore = parseMinScore(map.get(MIN_SCORE_KEY));
  const hideDealbreakers = parseBoolean(map.get(HIDE_DEALBREAKERS_KEY));

  if (minScore === null || hideDealbreakers === null) return DEFAULT_JOB_FEED_FILTERS;

  return {
    minScore,
    hideDealbreakers,
    enabledSources: DEFAULT_JOB_FEED_FILTERS.enabledSources,
    sortMode: DEFAULT_JOB_FEED_FILTERS.sortMode,
  };
}

export function updateJobFeedFilters(db: Database, filters: JobFeedFilters): JobFeedFilters {
  validateJobFeedFilters(filters);

  const tx = db.transaction((next: JobFeedFilters) => {
    const stmt = db.query(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    stmt.run(MIN_SCORE_KEY, String(next.minScore));
    stmt.run(HIDE_DEALBREAKERS_KEY, String(next.hideDealbreakers));
  });
  tx(filters);

  return getJobFeedFilters(db);
}

export function validateJobFeedFilters(filters: JobFeedFilters): void {
  if (
    !Number.isFinite(filters.minScore)
    || !Number.isInteger(filters.minScore)
    || filters.minScore < 0
    || filters.minScore > 100
  ) {
    throw new Error("Feed minimum score must be between 0 and 100");
  }
  if (typeof filters.hideDealbreakers !== "boolean") {
    throw new Error("Feed hide dealbreakers must be a boolean");
  }
}

function parseMinScore(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_JOB_FEED_FILTERS.minScore;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return DEFAULT_JOB_FEED_FILTERS.hideDealbreakers;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
