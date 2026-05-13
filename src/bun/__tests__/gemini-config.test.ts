import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getConfiguredGeminiKey, hasConfiguredGeminiKey } from "../gemini-config";
import { storeSecret } from "../secret-store";

const migrationsDir = join(import.meta.dir, "../../../migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf-8"))
  .join("\n");

describe("gemini-config", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("returns null when neither secret store nor env contains a key", () => {
    expect(getConfiguredGeminiKey(db, {})).toBeNull();
    expect(hasConfiguredGeminiKey(db, {})).toBe(false);
  });

  test("falls back to GEMINI_API_KEY from env", () => {
    expect(getConfiguredGeminiKey(db, { GEMINI_API_KEY: "env-gemini-key" })).toBe("env-gemini-key");
    expect(hasConfiguredGeminiKey(db, { GEMINI_API_KEY: "env-gemini-key" })).toBe(true);
  });

  test("falls back to GOOGLE_API_KEY from env", () => {
    expect(getConfiguredGeminiKey(db, { GOOGLE_API_KEY: "env-google-key" })).toBe("env-google-key");
  });

  test("prefers stored secret over env fallback", () => {
    storeSecret(db, "gemini_api_key_enc", "stored-key");
    expect(getConfiguredGeminiKey(db, { GEMINI_API_KEY: "env-key" })).toBe("stored-key");
  });
});
