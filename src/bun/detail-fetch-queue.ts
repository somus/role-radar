import type { Database } from "bun:sqlite";
import { Bunqueue } from "bunqueue/client";
import type { JobSourceId, Profile } from "../shared/types";
import {
  setJobStatus,
  setJobDetails,
  getJobsForHeuristicScoring,
  updateHeuristicScores,
  getTopNSetting,
} from "./job-store";
import { selectTopN, scoreJob } from "./heuristic-scorer";
import type { JobSource } from "./sources/job-source";

export type DetailJobData = { jobId: number; sourceId: string; url?: string | null };

export type DetailEvent =
  | { type: "detail:queued"; payload: { count: number; source: JobSourceId } }
  | { type: "detail:fetching"; payload: { jobId: number; sourceId: string; source: JobSourceId } }
  | { type: "detail:ready"; payload: { jobId: number; source: JobSourceId } }
  | { type: "detail:failed"; payload: { jobId: number; message: string; source: JobSourceId } }
  | { type: "detail:circuit_open"; payload: { source: JobSourceId } }
  | { type: "detail:complete"; payload: { ready: number; failed: number; source: JobSourceId } };

export type EventSink = (event: DetailEvent) => void;

export type DetailFetchQueueOptions = {
  db: Database;
  source: JobSource;
  emit?: EventSink;
  concurrency?: number;
  rateLimitMs?: number;
  fetchTimeoutMs?: number;
  dataPath?: string;
  queueName?: string;
};

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;
const NON_REQUEUEABLE_STATUSES = new Set(["queued", "fetching", "ready_for_scoring"]);

export class DetailFetchQueue {
  private readonly db: Database;
  private readonly source: JobSource;
  private readonly emit: EventSink;
  private readonly bq: Bunqueue<DetailJobData, void>;
  private readonly fetchTimeoutMs: number;
  private ready = 0;
  private failed = 0;
  private enqueuedTotal = 0;
  private drained = true;

  constructor(opts: DetailFetchQueueOptions) {
    this.db = opts.db;
    this.source = opts.source;
    this.emit = opts.emit ?? (() => {});
    this.fetchTimeoutMs = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    const concurrency = opts.concurrency ?? (opts.source.capabilities.mode === "native" ? 1 : opts.source.capabilities.detailConcurrency);
    const rateLimitMs = opts.rateLimitMs ?? opts.source.capabilities.rateLimit.perMs;
    const queueName = opts.queueName ?? `role-radar-detail-${opts.source.id}`;

    this.bq = new Bunqueue<DetailJobData, void>(queueName, {
      embedded: true,
      dataPath: opts.dataPath,
      concurrency,
      processor: async (job) => {
        await this.process(job.data);
      },
      rateLimit: { max: 1, duration: rateLimitMs },
      circuitBreaker: {
        threshold: CIRCUIT_THRESHOLD,
        resetTimeout: CIRCUIT_RESET_MS,
        onOpen: () => this.emit({ type: "detail:circuit_open", payload: { source: this.source.id } }),
      },
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
  }

  get sourceId(): JobSourceId {
    return this.source.id;
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
    this.emit({ type: "detail:queued", payload: { count: eligible.length, source: this.source.id } });

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
    this.emit({ type: "detail:complete", payload: { ready: this.ready, failed: this.failed, source: this.source.id } });
  }

  async close(): Promise<void> {
    await this.bq.close();
  }

  private async process(data: DetailJobData): Promise<void> {
    setJobStatus(this.db, data.jobId, "fetching");
    this.emit({ type: "detail:fetching", payload: { ...data, source: this.source.id } });
    try {
      if (!this.source.fetchDetails) {
        // Source declared listHasDescription=true; nothing to fetch. Mark ready.
        setJobStatus(this.db, data.jobId, "ready_for_scoring");
        this.ready++;
        this.emit({ type: "detail:ready", payload: { jobId: data.jobId, source: this.source.id } });
        return;
      }
      const detail = await withTimeout(
        this.source.fetchDetails({ sourceId: data.sourceId, url: data.url ?? null }),
        this.fetchTimeoutMs,
        `detail fetch timed out after ${this.fetchTimeoutMs}ms`,
      );
      setJobDetails(this.db, data.jobId, detail);
      this.ready++;
      this.emit({ type: "detail:ready", payload: { jobId: data.jobId, source: this.source.id } });
    } catch (err: any) {
      setJobStatus(this.db, data.jobId, "fetch_failed");
      this.failed++;
      this.emit({
        type: "detail:failed",
        payload: { jobId: data.jobId, message: err?.message ?? String(err), source: this.source.id },
      });
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

export type QueueDispatcher = {
  getQueue(sourceId: JobSourceId): DetailFetchQueue | undefined;
  queues(): DetailFetchQueue[];
};

export async function runHeuristicAndQueueDetails(
  db: Database,
  profile: Profile,
  dispatcher: QueueDispatcher,
): Promise<{ scored: number; queued: number }> {
  const candidates = getJobsForHeuristicScoring(db);
  if (candidates.length === 0) return { scored: 0, queued: 0 };

  const scores = candidates.map((j) => ({ jobId: j.id, score: scoreJob(j, profile) }));
  updateHeuristicScores(db, scores);

  const topN = getTopNSetting(db);
  const selected = selectTopN(candidates, profile, topN);
  if (selected.length === 0) return { scored: candidates.length, queued: 0 };

  const grouped = new Map<JobSourceId, DetailJobData[]>();
  for (const job of selected) {
    if (!job.source_id) continue;
    const arr = grouped.get(job.source as JobSourceId) ?? [];
    arr.push({ jobId: job.id, sourceId: job.source_id, url: job.url });
    grouped.set(job.source as JobSourceId, arr);
  }

  let queued = 0;
  for (const [sourceId, items] of grouped) {
    const queue = dispatcher.getQueue(sourceId);
    if (!queue) continue;
    await queue.enqueue(items);
    queued += items.length;
  }

  for (const queue of dispatcher.queues()) {
    await queue.drain();
  }

  return { scored: candidates.length, queued };
}
