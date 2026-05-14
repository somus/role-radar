import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_JOB_FEED_FILTERS } from "../../shared/types";
import { getJobFeedFilters, updateJobFeedFilters } from "../feed-filter-settings";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/005_feed_filters_dealbreakers.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/007_multi_source.sql"), "utf-8"),
].join("\n");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

describe("feed filter settings", () => {
  test("returns defaults from migrations", () => {
    const db = freshDb();

    expect(getJobFeedFilters(db)).toEqual(DEFAULT_JOB_FEED_FILTERS);
  });

  test("persists min score and hide dealbreakers", () => {
    const db = freshDb();

    const saved = updateJobFeedFilters(db, {
      minScore: 65,
      hideDealbreakers: true,
      enabledSources: DEFAULT_JOB_FEED_FILTERS.enabledSources,
      sortMode: DEFAULT_JOB_FEED_FILTERS.sortMode,
    });

    expect(saved).toEqual({
      minScore: 65,
      hideDealbreakers: true,
      enabledSources: DEFAULT_JOB_FEED_FILTERS.enabledSources,
      sortMode: DEFAULT_JOB_FEED_FILTERS.sortMode,
    });
    expect(getJobFeedFilters(db)).toEqual(saved);
  });

  test("falls back to defaults when stored settings are malformed", () => {
    const db = freshDb();
    db.query("UPDATE settings SET value = 'not-a-number' WHERE key = 'feed_min_score'").run();
    db.query("UPDATE settings SET value = 'yes' WHERE key = 'feed_hide_dealbreakers'").run();

    expect(getJobFeedFilters(db)).toEqual(DEFAULT_JOB_FEED_FILTERS);
  });

  test("rejects min score outside 0 to 100", () => {
    const db = freshDb();

    expect(() => updateJobFeedFilters(db, {
      minScore: 101,
      hideDealbreakers: false,
      enabledSources: DEFAULT_JOB_FEED_FILTERS.enabledSources,
      sortMode: DEFAULT_JOB_FEED_FILTERS.sortMode,
    })).toThrow("Feed minimum score must be between 0 and 100");
  });

  test("rejects non-boolean hide dealbreakers values", () => {
    const db = freshDb();

    expect(() => updateJobFeedFilters(db, {
      minScore: 0,
      hideDealbreakers: "yes" as any,
      enabledSources: DEFAULT_JOB_FEED_FILTERS.enabledSources,
      sortMode: DEFAULT_JOB_FEED_FILTERS.sortMode,
    })).toThrow("Feed hide dealbreakers must be a boolean");
  });
});
