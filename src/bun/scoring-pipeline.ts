import type { Database } from "bun:sqlite";
import { Bunqueue } from "bunqueue/client";
import type { FitResult, FitWeights, Job, PipelineEvent, Profile, ScoreGroup } from "../shared/types";
import { GEMINI_FLASH, GEMINI_FLASH_LITE } from "./gemini-client";
import { calculateComposite, scoreJob, type ScoreJobResult, type StructuredInferenceClient } from "./llm-scorer";
import { getScoreWeights } from "./score-weight-settings";
import { scoreGroup } from "../shared/score-weights";

type ScoreJobData = { jobId: number };

export type ScoreEvent = Extract<
  PipelineEvent,
  { type: "score:queued" | "score:scoring" | "score:ready" | "score:failed" | "score:complete" }
>;

export type ScoreRunner = (job: Job, profile: Profile, resumeText: string) => Promise<ScoreJobResult>;

export type RunScoringPipelineOptions = {
  db: Database;
  profile: Profile;
  resumeText: string;
  client?: StructuredInferenceClient;
  scorer?: ScoreRunner;
  emit?: (event: ScoreEvent) => void;
  dataPath?: string;
  queueName?: string;
  concurrency?: number;
  model?: string;
};

const DEFAULT_CONCURRENCY = 5;
const SUPPORTED_GEMINI_MODELS = new Set([GEMINI_FLASH, GEMINI_FLASH_LITE]);

export async function runScoringPipeline(opts: RunScoringPipelineOptions): Promise<{ scored: number; failed: number }> {
  const jobs = getJobsReadyForScoring(opts.db);
  if (jobs.length === 0) {
    console.log("[score] no jobs in ready_for_scoring");
    return { scored: 0, failed: 0 };
  }

  console.log(`[score] found ${jobs.length} jobs in ready_for_scoring`);

  const scorer = opts.scorer ?? buildScoreRunner(opts.client, opts.model ?? resolveSelectedModel(opts.db));
  const queue = new ScoringQueue({
    db: opts.db,
    profile: opts.profile,
    resumeText: opts.resumeText,
    scorer,
    emit: opts.emit,
    dataPath: opts.dataPath,
    queueName: opts.queueName,
    concurrency: opts.concurrency,
  });

  try {
    await queue.enqueue(jobs.map((job) => ({ jobId: job.id })));
    await queue.drain();
    return queue.getResult();
  } finally {
    await queue.close();
  }
}

class ScoringQueue {
  private readonly db: Database;
  private readonly profile: Profile;
  private readonly resumeText: string;
  private readonly scorer: ScoreRunner;
  private readonly emit: (event: ScoreEvent) => void;
  private readonly bq: Bunqueue<ScoreJobData, void>;
  private readonly concurrency: number;
  private readonly weights: FitWeights;
  private ready = 0;
  private failed = 0;
  private enqueuedTotal = 0;
  private drained = true;

  constructor(opts: Required<Pick<RunScoringPipelineOptions, "db" | "profile" | "resumeText">> & {
    scorer: ScoreRunner;
    emit?: (event: ScoreEvent) => void;
    dataPath?: string;
    queueName?: string;
    concurrency?: number;
  }) {
    this.db = opts.db;
    this.profile = opts.profile;
    this.resumeText = opts.resumeText;
    this.scorer = opts.scorer;
    this.emit = opts.emit ?? (() => {});
    this.concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
    this.weights = getScoreWeights(this.db);

    this.bq = new Bunqueue<ScoreJobData, void>(opts.queueName ?? "role-radar-scoring", {
      embedded: true,
      dataPath: opts.dataPath,
      concurrency: this.concurrency,
      processor: async (job) => {
        await this.process(job.data);
      },
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
  }

  async enqueue(jobs: ScoreJobData[]): Promise<void> {
    const eligible = jobs.filter(({ jobId }) => {
      const row = this.db.query("SELECT status FROM jobs WHERE id = ?").get(jobId) as { status: string } | null;
      return row?.status === "ready_for_scoring";
    });
    if (eligible.length === 0) {
      console.log("[score] enqueue skipped: no eligible jobs still in ready_for_scoring");
      return;
    }

    this.enqueuedTotal = eligible.length;
    this.drained = false;
    this.emit({ type: "score:queued", payload: { count: eligible.length } });
    console.log(
      `[score] enqueue ${eligible.length} jobs with concurrency=${this.concurrency}: ${eligible
        .map((job) => job.jobId)
        .join(", ")}`,
    );
    await this.bq.addBulk(
      eligible.map((job) => ({
        name: "score",
        data: job,
      })),
    );
  }

  async drain(): Promise<void> {
    if (this.drained) return;
    console.log(`[score] drain waiting for ${this.enqueuedTotal} jobs`);
    while (this.ready + this.failed < this.enqueuedTotal) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    this.drained = true;
    console.log(`[score] drain complete ready=${this.ready} failed=${this.failed}`);
    this.emit({ type: "score:complete", payload: { ready: this.ready, failed: this.failed } });
  }

  async close(): Promise<void> {
    await this.bq.close();
  }

  getResult(): { scored: number; failed: number } {
    return { scored: this.ready, failed: this.failed };
  }

  private async process(data: ScoreJobData): Promise<void> {
    const job = getJobById(this.db, data.jobId);
    if (!job) {
      console.warn(`[score] job ${data.jobId} disappeared before processing`);
      return;
    }

    setJobStatus(this.db, job.id, "scoring");
    this.emit({ type: "score:scoring", payload: { jobId: job.id } });
    console.log(`[score] start job=${job.id} sourceId=${job.source_id} title=${JSON.stringify(job.title)}`);

    try {
      const started = performance.now();
      const scored = await this.scorer(job, this.profile, this.resumeText);
      persistScore(this.db, job.id, this.profile.id, scored, this.weights);
      setJobStatus(this.db, job.id, "ready");
      this.ready++;

      const composite = calculateComposite(scored.result, this.weights);
      console.log(
        `[score] success job=${job.id} composite=${composite} overqualified=${scored.result.overqualified} model=${scored.model} in ${(
          (performance.now() - started) /
          1000
        ).toFixed(1)}s`,
      );
      this.emit({
        type: "score:ready",
        payload: {
          jobId: job.id,
          composite,
          group: getScoreGroup(composite),
          overqualified: scored.result.overqualified,
        },
      });
    } catch (error: any) {
      setJobStatus(this.db, job.id, "score_failed");
      this.failed++;
      console.error(`[score] failed job=${job.id}: ${error?.message ?? String(error)}`);
      this.emit({
        type: "score:failed",
        payload: { jobId: job.id, message: error?.message ?? String(error) },
      });
      throw error;
    }
  }
}

function buildScoreRunner(client: StructuredInferenceClient | undefined, model?: string): ScoreRunner {
  if (!client) throw new Error("Scoring pipeline requires either a scorer or a structured inference client");
  return (job, profile, resumeText) => scoreJob(job, profile, resumeText, client, model);
}

export function resolveSelectedModel(db: Database): string {
  const row = db.query("SELECT value FROM settings WHERE key = 'selected_model'").get() as { value: string } | null;
  const configured = row?.value?.trim();
  if (!configured) return GEMINI_FLASH;
  if (SUPPORTED_GEMINI_MODELS.has(configured)) return configured;

  console.warn(
    `[score] Unsupported selected_model=${JSON.stringify(configured)} for Gemini scoring; falling back to ${GEMINI_FLASH}`,
  );
  return GEMINI_FLASH;
}

function getJobsReadyForScoring(db: Database): Job[] {
  const rows = db.query("SELECT * FROM jobs WHERE status = 'ready_for_scoring' ORDER BY id").all() as any[];
  return rows.map(deserializeJob);
}

function getJobById(db: Database, jobId: number): Job | null {
  const row = db.query("SELECT * FROM jobs WHERE id = ?").get(jobId) as any | null;
  return row ? deserializeJob(row) : null;
}

function deserializeJob(row: any): Job {
  return {
    id: row.id,
    source: row.source,
    source_id: row.source_id,
    title: row.title,
    company: row.company,
    location: row.location,
    url: row.url,
    posted_at: row.posted_at,
    posted_at_ts: row.posted_at_ts ?? null,
    posted_at_confidence: row.posted_at_confidence ?? "missing",
    posted_text: row.posted_text ?? null,
    description_excerpt_only: !!row.description_excerpt_only,
    canonical_job_id: row.canonical_job_id ?? null,
    dedup_key: row.dedup_key ?? null,
    status: row.status,
    description: row.description,
    seniority_level: row.seniority_level,
    employment_type: row.employment_type,
    job_function: row.job_function,
    industry: row.industry,
    heuristic_score: row.heuristic_score,
    resume_generated: !!row.resume_generated,
    is_new: !!row.is_new,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function persistScore(
  db: Database,
  jobId: number,
  profileId: number,
  scored: ScoreJobResult,
  weights: FitWeights,
): void {
  const composite = calculateComposite(scored.result, weights);
  db.query(
    `INSERT INTO scores (
      job_id, profile_id, skills_score, seniority_score, domain_score, location_score,
      composite, overqualified, matches, gaps, dealbreaker_violations, summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id, profile_id) DO UPDATE SET
      skills_score = excluded.skills_score,
      seniority_score = excluded.seniority_score,
      domain_score = excluded.domain_score,
      location_score = excluded.location_score,
      composite = excluded.composite,
      overqualified = excluded.overqualified,
      matches = excluded.matches,
      gaps = excluded.gaps,
      dealbreaker_violations = excluded.dealbreaker_violations,
      summary = excluded.summary`
  ).run(
    jobId,
    profileId,
    scored.result.skills_score,
    scored.result.seniority_score,
    scored.result.domain_score,
    scored.result.location_score,
    composite,
    scored.result.overqualified ? 1 : 0,
    JSON.stringify(scored.result.matches),
    JSON.stringify(scored.result.gaps),
    JSON.stringify(scored.result.dealbreaker_violations),
    scored.result.summary,
  );

  db.query(
    "INSERT INTO llm_reasoning (job_id, profile_id, prompt, response, model) VALUES (?, ?, ?, ?, ?)"
  ).run(jobId, profileId, scored.prompt, scored.rawResponse, scored.model);
}

function setJobStatus(db: Database, jobId: number, status: string): void {
  db.query("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, jobId);
}

export function getScoreGroup(composite: number): ScoreGroup {
  return scoreGroup(composite);
}
