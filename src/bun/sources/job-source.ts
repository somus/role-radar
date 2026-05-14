import type { JobSourceId, ParsedJob, ParsedJobDetail, SearchQuery } from "../../shared/types";

export type SourceMode = "http" | "native";

export type JobSourceCapabilities = {
  mode: SourceMode;
  hasDetail: boolean;
  listHasDescription: boolean;
  postedAtQuality: "exact" | "relative" | "missing";
  pageSize: number;
  rateLimit: { perMs: number };
  detailConcurrency: number;
  enabledByDefault: boolean;
};

export type NormalizedQuery = {
  keywords: string[];
  location: string | null;
  experienceLevel: string | null;
  remote: boolean;
};

export type SearchOptions = {
  target: number;
  onBatch?: (jobs: ParsedJob[]) => { inserted: number; skipped: number };
};

export type SearchResult = {
  jobs: ParsedJob[];
  inserted: number;
  failed: number;
};

export interface JobSource {
  id: JobSourceId;
  capabilities: JobSourceCapabilities;
  search(query: NormalizedQuery, opts: SearchOptions): Promise<SearchResult>;
  fetchDetails?(job: { sourceId: string; url: string | null }): Promise<ParsedJobDetail>;
}

export function toSearchQuery(q: NormalizedQuery): SearchQuery {
  return {
    keywords: q.keywords,
    location: q.location ?? undefined,
    experienceLevel: q.experienceLevel ?? undefined,
    remote: q.remote,
  };
}
