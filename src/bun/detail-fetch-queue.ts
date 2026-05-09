import type { Database } from "bun:sqlite";
import { Bunqueue } from "bunqueue/client";
import type { Profile } from "../shared/types";
import { LinkedInAdapter } from "./linkedin-adapter";
import {
  setJobStatus,
  setJobDetails,
  getJobsForHeuristicScoring,
  updateHeuristicScores,
  getTopNSetting,
} from "./job-store";
import { selectTopN, scoreJob } from "./heuristic-scorer";

export type DetailJobData = { jobId: number; sourceId: string };

export type DetailEvent =
  | { type: "detail:queued"; payload: { count: number } }
  | { type: "detail:fetching"; payload: { jobId: number; sourceId: string } }
  | { type: "detail:ready"; payload: { jobId: number } }
  | { type: "detail:failed"; payload: { jobId: number; message: string } }
  | { type: "detail:circuit_open"; payload: {} }
  | { type: "detail:complete"; payload: { ready: number; failed: number } };

export type EventSink = (event: DetailEvent) => void;

export type DetailFetchQueueOptions = {
  db: Database;
  adapter: LinkedInAdapter;
  emit?: EventSink;
  concurrency?: number;
  rateLimitMs?: number;
  fetchTimeoutMs?: number;
  dataPath?: string;
  queueName?: string;
};

// Concurrency 5: LinkedIn guest tolerates ~10 req/min; with 2.5s rate-limit gap, 5 in-flight stays comfortably under.
const DEFAULT_CONCURRENCY = 5;
// 2.5s gap between fetches keeps us under LinkedIn's per-IP throttle while still draining 50 jobs in ~2 min.
const DEFAULT_RATE_LIMIT_MS = 2500;
// 30s per-job timeout: long enough for slow LinkedIn responses, short enough that a stuck fetch can't hang drain().
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
// Trip the circuit after 5 consecutive failures so we stop hammering a broken source; reset after 30s probe.
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;
// Statuses that should NOT be re-queued: in-flight or already done. DB is the source of truth for dedup.
const NON_REQUEUEABLE_STATUSES = new Set(["queued", "fetching", "ready_for_scoring"]);

export class DetailFetchQueue {
  private readonly db: Database;
  private readonly adapter: LinkedInAdapter;
  private readonly emit: EventSink;
  private readonly bq: Bunqueue<DetailJobData, void>;
  private readonly fetchTimeoutMs: number;
  private ready = 0;
  private failed = 0;
  private enqueuedTotal = 0;
  private drained = true;

  constructor(opts: DetailFetchQueueOptions) {
    this.db = opts.db;
    this.adapter = opts.adapter;
    this.emit = opts.emit ?? (() => {});
    this.fetchTimeoutMs = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    this.bq = new Bunqueue<DetailJobData, void>(opts.queueName ?? "role-radar-detail-fetch", {
      embedded: true,
      dataPath: opts.dataPath,
      concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
      processor: async (job) => {
        await this.process(job.data);
      },
      rateLimit: { max: 1, duration: opts.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS },
      circuitBreaker: {
        threshold: CIRCUIT_THRESHOLD,
        resetTimeout: CIRCUIT_RESET_MS,
        onOpen: () => this.emit({ type: "detail:circuit_open", payload: {} }),
      },
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
  }

  async enqueue(jobs: DetailJobData[]): Promise<void> {
    if (jobs.length === 0) return;

    const eligible = jobs.filter((j) => {
      const row = this.db.query("SELECT status FROM jobs WHERE id = ?").get(j.jobId) as { status: string } | null;
      return row && !NON_REQUEUEABLE_STATUSES.has(row.status);
    });
    if (eligible.length === 0) return;

    for (const j of eligible) setJobStatus(this.db, j.jobId, "queued");
    this.enqueuedTotal += eligible.length;
    this.drained = false;
    this.emit({ type: "detail:queued", payload: { count: eligible.length } });

    try {
      await this.bq.addBulk(
        eligible.map((j) => ({
          name: "fetch",
          data: j,
        })),
      );
    } catch (err) {
      for (const j of eligible) setJobStatus(this.db, j.jobId, "discovered");
      this.enqueuedTotal -= eligible.length;
      throw err;
    }
  }

  async drain(): Promise<void> {
    if (this.drained) return;
    while (this.ready + this.failed < this.enqueuedTotal) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.drained = true;
    this.emit({ type: "detail:complete", payload: { ready: this.ready, failed: this.failed } });
  }

  async close(): Promise<void> {
    await this.bq.close();
  }

  private async process(data: DetailJobData): Promise<void> {
    setJobStatus(this.db, data.jobId, "fetching");
    this.emit({ type: "detail:fetching", payload: data });
    try {
      const detail = await withTimeout(
        this.adapter.fetchDetails(data.sourceId),
        this.fetchTimeoutMs,
        `detail fetch timed out after ${this.fetchTimeoutMs}ms`,
      );
      setJobDetails(this.db, data.jobId, detail);
      this.ready++;
      this.emit({ type: "detail:ready", payload: { jobId: data.jobId } });
    } catch (err: any) {
      setJobStatus(this.db, data.jobId, "fetch_failed");
      this.failed++;
      this.emit({ type: "detail:failed", payload: { jobId: data.jobId, message: err?.message ?? String(err) } });
      throw err;
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function runHeuristicAndQueueDetails(
  db: Database,
  profile: Profile,
  queue: DetailFetchQueue,
): Promise<{ scored: number; queued: number }> {
  const candidates = getJobsForHeuristicScoring(db);
  if (candidates.length === 0) return { scored: 0, queued: 0 };

  const scores = candidates.map(j => ({ jobId: j.id, score: scoreJob(j, profile) }));
  updateHeuristicScores(db, scores);

  const topN = getTopNSetting(db);
  const selected = selectTopN(candidates, profile, topN);
  if (selected.length === 0) return { scored: candidates.length, queued: 0 };

  const enqueueData = selected
    .filter(j => !!j.source_id)
    .map(j => ({ jobId: j.id, sourceId: j.source_id }));
  await queue.enqueue(enqueueData);
  await queue.drain();

  return { scored: candidates.length, queued: enqueueData.length };
}
