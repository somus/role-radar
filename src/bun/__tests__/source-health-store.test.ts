import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getSourceHealth,
  listEligibleSources,
  listEnabledSources,
  recordSearchFailure,
  recordSearchSuccess,
  restoreSource,
  setSourceEnabled,
} from "../source-health-store";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/007_multi_source.sql"), "utf-8"),
].join("\n");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

describe("source-health-store", () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  test("getSourceHealth seeds all 10 sources at 'ok'", () => {
    const health = getSourceHealth(db);
    expect(health.size).toBe(10);
    for (const row of health.values()) {
      expect(row.status).toBe("ok");
      expect(row.consecutive_failures).toBe(0);
    }
  });

  test("listEnabledSources returns all 10 by default", () => {
    expect(listEnabledSources(db).length).toBe(10);
  });

  test("setSourceEnabled toggles enabled flag", () => {
    setSourceEnabled(db, "naukri", false);
    const enabled = listEnabledSources(db);
    expect(enabled).not.toContain("naukri");
    expect(enabled.length).toBe(9);

    setSourceEnabled(db, "naukri", true);
    expect(listEnabledSources(db)).toContain("naukri");
  });

  test("recordSearchSuccess clears failures + sets last_ok_at", () => {
    recordSearchFailure(db, "shine", "zero_insert");
    recordSearchSuccess(db, "shine");
    const health = getSourceHealth(db).get("shine")!;
    expect(health.status).toBe("ok");
    expect(health.consecutive_failures).toBe(0);
    expect(health.last_ok_at).not.toBeNull();
  });

  test("recordSearchFailure marks broken after 1, quarantined after 3", () => {
    const r1 = recordSearchFailure(db, "indeed", "zero_insert");
    expect(r1.consecutiveFailures).toBe(1);
    expect(r1.quarantined).toBe(false);
    expect(getSourceHealth(db).get("indeed")!.status).toBe("broken");

    recordSearchFailure(db, "indeed", "zero_insert");
    const r3 = recordSearchFailure(db, "indeed", "error", "HTTP 403");
    expect(r3.consecutiveFailures).toBe(3);
    expect(r3.quarantined).toBe(true);
    const h = getSourceHealth(db).get("indeed")!;
    expect(h.status).toBe("quarantined");
    expect(h.last_error).toBe("HTTP 403");
  });

  test("listEligibleSources excludes disabled + quarantined", () => {
    setSourceEnabled(db, "apna", false);
    for (let i = 0; i < 3; i++) recordSearchFailure(db, "cutshort", "zero_insert");
    const eligible = listEligibleSources(db);
    expect(eligible).not.toContain("apna");
    expect(eligible).not.toContain("cutshort");
    expect(eligible.length).toBe(8);
  });

  test("restoreSource clears quarantine", () => {
    for (let i = 0; i < 3; i++) recordSearchFailure(db, "timesjobs", "zero_insert");
    expect(getSourceHealth(db).get("timesjobs")!.status).toBe("quarantined");
    restoreSource(db, "timesjobs");
    const health = getSourceHealth(db).get("timesjobs")!;
    expect(health.status).toBe("ok");
    expect(health.consecutive_failures).toBe(0);
    expect(health.last_error).toBeNull();
  });
});
