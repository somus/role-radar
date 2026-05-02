import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { storeSecret, getSecret, deleteSecret } from "../secret-store";

const migrationsDir = join(import.meta.dir, "../../../migrations");
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
const migrationSql = migrationFiles.map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");

describe("secret-store", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(migrationSql);
  });

  test("stores and retrieves a secret", () => {
    storeSecret(db, "test_key", "my-api-key-123");
    expect(getSecret(db, "test_key")).toBe("my-api-key-123");
  });

  test("returns null for non-existent key", () => {
    expect(getSecret(db, "missing")).toBeNull();
  });

  test("overwrites existing secret on re-store", () => {
    storeSecret(db, "test_key", "first-value");
    storeSecret(db, "test_key", "second-value");
    expect(getSecret(db, "test_key")).toBe("second-value");
  });

  test("deletes a secret", () => {
    storeSecret(db, "test_key", "to-be-deleted");
    deleteSecret(db, "test_key");
    expect(getSecret(db, "test_key")).toBeNull();
  });

  test("stores value encrypted, not plaintext", () => {
    storeSecret(db, "test_key", "super-secret");
    const row = db.query("SELECT value FROM settings WHERE key = ?").get("test_key") as { value: string };
    expect(row.value).not.toContain("super-secret");
    const envelope = JSON.parse(row.value);
    expect(envelope).toHaveProperty("c");
    expect(envelope).toHaveProperty("iv");
    expect(envelope).toHaveProperty("s");
    expect(envelope).toHaveProperty("t");
  });

  test("handles empty string secret", () => {
    storeSecret(db, "empty", "");
    expect(getSecret(db, "empty")).toBe("");
  });

  test("handles special characters in secret", () => {
    const special = "p@$$w0rd!#%^&*(){}[]|\\:\";<>?,./~`";
    storeSecret(db, "special", special);
    expect(getSecret(db, "special")).toBe(special);
  });

  test("different keys store independently", () => {
    storeSecret(db, "key_a", "value_a");
    storeSecret(db, "key_b", "value_b");
    expect(getSecret(db, "key_a")).toBe("value_a");
    expect(getSecret(db, "key_b")).toBe("value_b");
  });

  test("returns null if stored value is corrupted", () => {
    db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run("corrupted", "not-json");
    expect(getSecret(db, "corrupted")).toBeNull();
  });
});
