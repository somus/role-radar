import type { Database } from "bun:sqlite";
import type { JobSourceId, ParsedJob, PipelineEvent } from "../shared/types";
import { storeJobs } from "./job-store";
import {
  listEligibleSources,
  recordSearchFailure,
  recordSearchSuccess,
} from "./source-health-store";
import type { JobSource, NormalizedQuery } from "./sources/job-source";
import type { SourceRegistry } from "./sources/registry";

export type OrchestratorOptions = {
  db: Database;
  registry: SourceRegistry;
  queries: NormalizedQuery[];
  maxJobs: number;
  floor?: number;
  enabledSources?: JobSourceId[];
  emit?: (event: PipelineEvent) => void;
};

export type OrchestratorResult = {
  totalInserted: number;
  perSource: Map<JobSourceId, number>;
  failedSources: JobSourceId[];
};

const DEFAULT_FLOOR = 5;

type Slot = {
  source: JobSource;
  query: NormalizedQuery;
};

export async function runSearchOrchestration(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const { db, registry, queries, maxJobs, emit } = opts;
  const eligible = (opts.enabledSources ?? listEligibleSources(db))
    .map((id) => registry.get(id))
    .filter((s): s is JobSource => !!s);

  if (eligible.length === 0 || queries.length === 0) {
    return { totalInserted: 0, perSource: new Map(), failedSources: [] };
  }

  const slots: Slot[] = [];
  for (const source of eligible) {
    for (const query of queries) {
      slots.push({ source, query });
    }
  }

  const floor = Math.max(1, opts.floor ?? DEFAULT_FLOOR);
  const targetPerSlot = Math.max(floor, Math.ceil(maxJobs / slots.length));

  const perSource = new Map<JobSourceId, number>();
  const failedSources: JobSourceId[] = [];
  let totalInserted = 0;

  for (const slot of slots) {
    if (totalInserted >= maxJobs) break;

    emit?.({ type: "job:searching", payload: { query: toEventQuery(slot.query), source: slot.source.id } });

    try {
      const result = await slot.source.search(slot.query, {
        target: Math.min(targetPerSlot, maxJobs - totalInserted),
        onBatch: (batch) => {
          if (totalInserted >= maxJobs) return { inserted: 0, skipped: batch.length };
          const remaining = maxJobs - totalInserted;
          const trimmed: ParsedJob[] = batch.slice(0, remaining);
          const overflow = batch.length - trimmed.length;
          const inserted = trimmed.length > 0 ? storeJobs(db, trimmed) : { inserted: 0, skipped: 0 };
          totalInserted += inserted.inserted;
          perSource.set(slot.source.id, (perSource.get(slot.source.id) ?? 0) + inserted.inserted);
          if (inserted.inserted > 0) {
            emit?.({ type: "job:discovered", payload: { count: inserted.inserted, source: slot.source.id } });
          }
          return {
            inserted: inserted.inserted,
            skipped: inserted.skipped + overflow,
          };
        },
      });

      const slotInserted = perSource.get(slot.source.id) ?? 0;
      if (slotInserted === 0) {
        recordSearchFailure(db, slot.source.id, "zero_insert");
        if (!failedSources.includes(slot.source.id)) failedSources.push(slot.source.id);
      } else {
        recordSearchSuccess(db, slot.source.id);
      }
      emit?.({
        type: "job:search:complete",
        payload: {
          total: result.jobs.length,
          source: slot.source.id,
          inserted: result.inserted,
          failed: result.failed,
        },
      });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      recordSearchFailure(db, slot.source.id, "error", message);
      if (!failedSources.includes(slot.source.id)) failedSources.push(slot.source.id);
      emit?.({ type: "job:search:error", payload: { message, source: slot.source.id } });
    }
  }

  return { totalInserted, perSource, failedSources };
}

function toEventQuery(q: NormalizedQuery) {
  return {
    keywords: q.keywords,
    location: q.location ?? undefined,
    experienceLevel: q.experienceLevel ?? undefined,
    remote: q.remote,
  };
}
