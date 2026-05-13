import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_FIT_WEIGHTS } from "../../shared/score-weights";
import { getScoreWeights, updateScoreWeights } from "../score-weight-settings";

const migrationSql = readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

describe("score weight settings", () => {
  test("returns defaults from migrations", () => {
    const db = freshDb();

    expect(getScoreWeights(db)).toEqual(DEFAULT_FIT_WEIGHTS);
  });

  test("persists all score weights", () => {
    const db = freshDb();

    const saved = updateScoreWeights(db, {
      skills: 25,
      seniority: 25,
      domain: 25,
      location: 25,
    });

    expect(saved).toEqual({
      skills: 25,
      seniority: 25,
      domain: 25,
      location: 25,
    });
    expect(getScoreWeights(db)).toEqual(saved);
  });

  test("falls back to defaults when stored weights do not sum to 100", () => {
    const db = freshDb();
    db.query("UPDATE settings SET value = '90' WHERE key = 'weights_skills'").run();

    expect(getScoreWeights(db)).toEqual(DEFAULT_FIT_WEIGHTS);
  });

  test("falls back to defaults when stored weights are malformed", () => {
    const db = freshDb();
    db.query("UPDATE settings SET value = 'not-a-number' WHERE key = 'weights_location'").run();

    expect(getScoreWeights(db)).toEqual(DEFAULT_FIT_WEIGHTS);
  });

  test("rejects weights that do not sum to 100", () => {
    const db = freshDb();

    expect(() => updateScoreWeights(db, {
      skills: 25,
      seniority: 25,
      domain: 25,
      location: 24,
    })).toThrow("Score weights must sum to 100");
  });

  test("rejects weights outside 0 to 100", () => {
    const db = freshDb();

    expect(() => updateScoreWeights(db, {
      skills: 120,
      seniority: -20,
      domain: 0,
      location: 0,
    })).toThrow("Score weights must be between 0 and 100");
  });
});
