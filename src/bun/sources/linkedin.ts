import type { JobSourceId, ParsedJob, ParsedJobDetail, SelectorConfig } from "../../shared/types";
import { LinkedInAdapter } from "../linkedin-adapter";
import {
  toSearchQuery,
  type JobSource,
  type JobSourceCapabilities,
  type NormalizedQuery,
  type SearchOptions,
  type SearchResult,
} from "./job-source";

type LinkedInSourceOptions = {
  selectors: SelectorConfig;
  fetchFn?: typeof fetch;
  delayMs?: number;
  maxAgeSecs?: number;
  pagesPerQuery?: number;
};

export class LinkedInSource implements JobSource {
  readonly id: JobSourceId = "linkedin";
  readonly capabilities: JobSourceCapabilities = {
    mode: "http",
    hasDetail: true,
    listHasDescription: false,
    postedAtQuality: "exact",
    pageSize: 10,
    rateLimit: { perMs: 2500 },
    detailConcurrency: 5,
    enabledByDefault: true,
  };

  private readonly baseOptions: LinkedInSourceOptions;
  private readonly detailAdapter: LinkedInAdapter;

  constructor(opts: LinkedInSourceOptions) {
    this.baseOptions = opts;
    this.detailAdapter = new LinkedInAdapter({
      fetchFn: opts.fetchFn,
      selectors: opts.selectors,
      delayMs: opts.delayMs ?? this.capabilities.rateLimit.perMs,
      maxAgeSecs: opts.maxAgeSecs,
      pagesPerQuery: opts.pagesPerQuery,
    });
  }

  async search(query: NormalizedQuery, opts: SearchOptions): Promise<SearchResult> {
    let inserted = 0;
    let failed = 0;

    const adapter = new LinkedInAdapter({
      fetchFn: this.baseOptions.fetchFn,
      selectors: this.baseOptions.selectors,
      delayMs: this.baseOptions.delayMs ?? this.capabilities.rateLimit.perMs,
      maxAgeSecs: this.baseOptions.maxAgeSecs,
      pagesPerQuery: this.computePagesPerQuery(opts.target),
    });

    const jobs = await adapter.search(toSearchQuery(query), (batch) => {
      if (opts.onBatch) {
        const r = opts.onBatch(batch);
        inserted += r.inserted;
        return r;
      }
      inserted += batch.length;
      return { inserted: batch.length, skipped: 0 };
    });

    failed = jobs.filter((j) => j.status === "parse_failed").length;
    return { jobs, inserted, failed };
  }

  private computePagesPerQuery(target: number): number {
    if (!Number.isFinite(target) || target <= 0) {
      return this.baseOptions.pagesPerQuery ?? 3;
    }
    const perKeyword = Math.max(1, Math.ceil(target / this.capabilities.pageSize));
    if (this.baseOptions.pagesPerQuery !== undefined) {
      return Math.min(perKeyword, this.baseOptions.pagesPerQuery);
    }
    return perKeyword;
  }

  async fetchDetails(job: { sourceId: string; url: string | null }): Promise<ParsedJobDetail> {
    return this.detailAdapter.fetchDetails(job.sourceId);
  }

  rawAdapter(): LinkedInAdapter {
    return this.detailAdapter;
  }
}

export function createLinkedInSource(opts: LinkedInSourceOptions): LinkedInSource {
  return new LinkedInSource(opts);
}
