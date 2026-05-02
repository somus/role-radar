import type { CityResult, ParsedJob, SearchQuery, SelectorConfig } from "../shared/types";
import { parseSearchResults } from "./html-rewriter-parser";

const BASE_URL = "https://www.linkedin.com";
const TYPEAHEAD_URL = `${BASE_URL}/jobs-guest/api/typeaheadHits`;

const cityCache = new Map<string, { results: CityResult[]; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function searchCities(query: string, fetchFn = fetch): Promise<CityResult[]> {
  const key = query.toLowerCase().trim();
  if (!key) return [];

  const cached = cityCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.results;

  const url = `${TYPEAHEAD_URL}?query=${encodeURIComponent(key)}&typeaheadType=GEO`;
  const res = await fetchFn(url);
  if (!res.ok) return [];

  const html = await res.text();
  const results = parseCityTypeahead(html);
  cityCache.set(key, { results, ts: Date.now() });
  return results;
}

function parseCityTypeahead(html: string): CityResult[] {
  try {
    const data = JSON.parse(html);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id: String(item.id ?? ""),
      name: item.displayName ?? item.text ?? "",
      country: item.subtext ?? "",
    })).filter((c: CityResult) => c.id && c.name);
  } catch {
    return [];
  }
}
// LinkedIn rate-limits at ~10 req/min; 30s base with exponential backoff avoids bans
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 30_000;
// LinkedIn guest API returns 10 results per page
const PAGE_SIZE = 10;

type AdapterOptions = {
  fetchFn?: typeof fetch;
  selectors: SelectorConfig;
  delayMs?: number;
  maxAgeSecs?: number;
  pagesPerQuery?: number;
  startPage?: number;
};

export class LinkedInAdapter {
  private fetchFn: typeof fetch;
  private selectors: SelectorConfig;
  private delayMs: number;
  private maxAgeSecs: number;
  private pagesPerQuery: number;
  private startPage: number;

  constructor(opts: AdapterOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.selectors = opts.selectors;
    this.delayMs = opts.delayMs ?? 2500;
    this.maxAgeSecs = opts.maxAgeSecs ?? 604800;
    this.pagesPerQuery = opts.pagesPerQuery ?? 3;
    this.startPage = opts.startPage ?? 0;
  }

  buildSearchUrl(keywords: string, query: SearchQuery, extraParams?: Record<string, string>): string {
    const params = new URLSearchParams();
    params.set("keywords", keywords);
    if (query.geoId) params.set("geoId", query.geoId);
    else if (query.location) params.set("location", query.location);
    if (query.experienceLevel) params.set("f_E", query.experienceLevel);
    if (query.jobTypes && query.jobTypes.length > 0) params.set("f_JT", query.jobTypes.join(","));
    if (this.maxAgeSecs > 0) params.set("f_TPR", `r${this.maxAgeSecs}`);
    params.set("sortBy", "DD");
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        params.set(k, v);
      }
    }
    return `${BASE_URL}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;
  }

  async search(
    query: SearchQuery,
    onProgress?: (jobs: ParsedJob[]) => { inserted: number; skipped: number }
  ): Promise<ParsedJob[]> {
    const allJobs: ParsedJob[] = [];

    for (let i = 0; i < query.keywords.length; i++) {
      if (i > 0 && this.delayMs > 0) await sleep(this.delayMs);
      const kw = query.keywords[i]!;
      const jobs = await this.fetchAllPages(kw, query, undefined, onProgress);
      allJobs.push(...jobs);

      if (query.remote && (query.remoteLocation || query.location)) {
        if (this.delayMs > 0) await sleep(this.delayMs);
        const remoteQuery = query.remoteLocation
          ? { ...query, location: query.remoteLocation, geoId: undefined }
          : query;
        const remoteJobs = await this.fetchAllPages(kw, remoteQuery, { f_WT: "2" }, onProgress);
        allJobs.push(...remoteJobs);
      }
    }

    return allJobs;
  }

  private async fetchAllPages(
    keywords: string,
    query: SearchQuery,
    extraParams?: Record<string, string>,
    onProgress?: (jobs: ParsedJob[]) => { inserted: number; skipped: number }
  ): Promise<ParsedJob[]> {
    const allJobs: ParsedJob[] = [];
    const label = extraParams?.f_WT ? `${keywords} (remote)` : keywords;

    for (let page = this.startPage; page < this.pagesPerQuery; page++) {
      if (page > this.startPage && this.delayMs > 0) await sleep(this.delayMs);
      const start = page * PAGE_SIZE;
      const url = this.buildSearchUrl(keywords, query, { ...extraParams, start: String(start) });
      const jobs = await this.fetchAndParse(url);
      console.log(`[linkedin] "${label}" page ${page + 1} → ${jobs.length} jobs`);
      allJobs.push(...jobs);
      if (jobs.length < PAGE_SIZE) break;
      if (onProgress) {
        const result = onProgress(jobs);
        if (result.skipped >= jobs.length * 0.8) {
          console.log(`[linkedin] "${label}" page ${page + 1}: ${result.skipped}/${jobs.length} dupes, stopping pagination`);
          break;
        }
      }
    }

    return allJobs;
  }

  private async fetchAndParse(url: string): Promise<ParsedJob[]> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.fetchFn(url);

      if (res.status === 429 || res.status === 403) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Rate limited after ${MAX_RETRIES} retries (HTTP ${res.status})`);
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        if (this.delayMs > 0) await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`LinkedIn search failed: HTTP ${res.status}`);
      }

      const html = await res.text();
      return parseSearchResults(html, this.selectors);
    }

    throw new Error("Search failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
