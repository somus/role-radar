import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Utils } from "electrobun/bun";
import { mkdirSync } from "fs";

let db: Database;

export function getDb(): Database {
  if (!db) {
    const dataDir = Utils.paths.userData;
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, "role-radar.db");
    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
  }
  return db;
}

export function runMigrations(): { applied: number } {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    database
      .query("SELECT name FROM _migrations")
      .all()
      .map((row: any) => row.name)
  );

  const candidateDirs = [
    join(import.meta.dir, "app", "migrations"),
    join(import.meta.dir, "../../migrations"),
    join(import.meta.dir, "../migrations"),
    join(import.meta.dir, "migrations"),
  ];
  const migrationsDir = candidateDirs.find((d) => {
    try {
      readdirSync(d);
      return true;
    } catch {
      return false;
    }
  }) ?? join(import.meta.dir, "migrations");
  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return { applied: 0 };
  }

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    database.exec(sql);
    database.query("INSERT INTO _migrations (name) VALUES (?)").run(file);
    count++;
  }

  return { applied: count };
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
