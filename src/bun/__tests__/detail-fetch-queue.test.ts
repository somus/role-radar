import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { shutdownManager } from "bunqueue/client";
import { DetailFetchQueue, type DetailEvent } from "../detail-fetch-queue";
import type { LinkedInAdapter } from "../linkedin-adapter";
import type { ParsedJobDetail } from "../../shared/types";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/002_enrichment_questions_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/003_generated_queries_cache.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/004_job_status_index.sql"), "utf-8"),
].join("\n");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

function insertQueueableJob(db: Database, sourceId: string): number {
  db.query(
    "INSERT INTO jobs (source, source_id, title, status) VALUES ('linkedin', ?, ?, 'discovered')"
  ).run(sourceId, `Job ${sourceId}`);
  return (db.query("SELECT id FROM jobs WHERE source_id = ?").get(sourceId) as { id: number }).id;
}

const okDetail: ParsedJobDetail = {
  description: "desc",
  seniority: "Senior",
  employmentType: "Full-time",
  function: "Engineering",
  industry: "Software",
};

function mockAdapter(impl?: (sourceId: string) => Promise<ParsedJobDetail>): LinkedInAdapter {
  const fn = impl ?? (async () => okDetail);
  return { fetchDetails: mock(fn) } as unknown as LinkedInAdapter;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "bq-detail-"));
});

afterEach(() => {
  shutdownManager();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("DetailFetchQueue", () => {
  test("enqueue marks all jobs as 'queued' in DB", async () => {
    const db = freshDb();
    const a = insertQueueableJob(db, "a");
    const b = insertQueueableJob(db, "b");

    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-enqueue",
      rateLimitMs: 1,
    });
    await q.enqueue([{ jobId: a, sourceId: "a" }, { jobId: b, sourceId: "b" }]);

    const rows = db.query("SELECT status FROM jobs ORDER BY id").all() as { status: string }[];
    expect(rows.every(r => r.status === "queued" || r.status === "fetching" || r.status === "ready_for_scoring")).toBe(true);

    await q.drain();
    await q.close();
  });

  test("happy path transitions: queued → fetching → ready_for_scoring", async () => {
    const db = freshDb();
    const id = insertQueueableJob(db, "ok");

    const events: DetailEvent[] = [];
    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(),
      emit: (e) => events.push(e),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-happy",
      rateLimitMs: 1,
    });

    await q.enqueue([{ jobId: id, sourceId: "ok" }]);
    await q.drain();

    const row = db.query("SELECT status, description, seniority_level FROM jobs WHERE id = ?").get(id) as any;
    expect(row.status).toBe("ready_for_scoring");
    expect(row.description).toBe("desc");
    expect(row.seniority_level).toBe("Senior");

    const types = events.map(e => e.type);
    expect(types).toContain("detail:queued");
    expect(types).toContain("detail:fetching");
    expect(types).toContain("detail:ready");
    expect(types).toContain("detail:complete");

    await q.close();
  });

  test("failure path: job ends as fetch_failed when adapter throws", async () => {
    const db = freshDb();
    const id = insertQueueableJob(db, "boom");

    const events: DetailEvent[] = [];
    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(async () => { throw new Error("network down"); }),
      emit: (e) => events.push(e),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-fail",
      rateLimitMs: 1,
    });

    await q.enqueue([{ jobId: id, sourceId: "boom" }]);
    await q.drain();

    const row = db.query("SELECT status FROM jobs WHERE id = ?").get(id) as any;
    expect(row.status).toBe("fetch_failed");

    const failedEvent = events.find(e => e.type === "detail:failed");
    expect(failedEvent?.payload).toMatchObject({ jobId: id, message: "network down" });

    await q.close();
  });

  test("enqueue skips jobs already in non-discoverable status (DB-level dedup)", async () => {
    const db = freshDb();
    const newJob = insertQueueableJob(db, "new");
    const inflight = insertQueueableJob(db, "inflight");
    db.query("UPDATE jobs SET status = 'fetching' WHERE id = ?").run(inflight);
    const done = insertQueueableJob(db, "done");
    db.query("UPDATE jobs SET status = 'ready_for_scoring' WHERE id = ?").run(done);

    let calls = 0;
    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(async () => { calls++; return okDetail; }),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-dbdedup",
      rateLimitMs: 1,
    });

    await q.enqueue([
      { jobId: newJob, sourceId: "new" },
      { jobId: inflight, sourceId: "inflight" },
      { jobId: done, sourceId: "done" },
    ]);
    await q.drain();

    expect(calls).toBe(1);
    expect((db.query("SELECT status FROM jobs WHERE id = ?").get(inflight) as any).status).toBe("fetching");
    expect((db.query("SELECT status FROM jobs WHERE id = ?").get(done) as any).status).toBe("ready_for_scoring");
    await q.close();
  });

  test("enqueue rolls back DB status to 'discovered' if addBulk throws", async () => {
    const db = freshDb();
    const id = insertQueueableJob(db, "rb");

    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-rollback",
      rateLimitMs: 1,
    });

    // Stub addBulk to throw, simulating a queue write failure.
    (q as any).bq.addBulk = mock(async () => { throw new Error("queue write failed"); });

    await expect(q.enqueue([{ jobId: id, sourceId: "rb" }])).rejects.toThrow("queue write failed");

    const row = db.query("SELECT status FROM jobs WHERE id = ?").get(id) as any;
    expect(row.status).toBe("discovered");

    await q.close();
  });

  test("drain() called twice emits detail:complete only once", async () => {
    const db = freshDb();
    const id = insertQueueableJob(db, "ddrain");

    const events: DetailEvent[] = [];
    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(),
      emit: (e) => events.push(e),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-doubledrain",
      rateLimitMs: 1,
    });

    await q.enqueue([{ jobId: id, sourceId: "ddrain" }]);
    await q.drain();
    await q.drain();

    const completes = events.filter(e => e.type === "detail:complete");
    expect(completes).toHaveLength(1);

    await q.close();
  });

  test("processes multiple jobs and emits one ready event per success", async () => {
    const db = freshDb();
    const ids = ["a", "b", "c"].map(s => insertQueueableJob(db, s));

    const events: DetailEvent[] = [];
    const q = new DetailFetchQueue({
      db,
      adapter: mockAdapter(),
      emit: (e) => events.push(e),
      dataPath: join(tmpDir, "queue.db"),
      queueName: "test-bulk",
      rateLimitMs: 1,
    });

    await q.enqueue(ids.map((id, i) => ({ jobId: id, sourceId: ["a", "b", "c"][i]! })));
    await q.drain();

    const readyEvents = events.filter(e => e.type === "detail:ready");
    expect(readyEvents).toHaveLength(3);

    const statuses = (db.query("SELECT status FROM jobs ORDER BY id").all() as any[]).map(r => r.status);
    expect(statuses).toEqual(["ready_for_scoring", "ready_for_scoring", "ready_for_scoring"]);

    await q.close();
  });
});
