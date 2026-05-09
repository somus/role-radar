import type { Job, Profile } from "../shared/types";

export type ScoreOpts = {
  now?: Date;
  recencyWindowDays?: number;
};

const W_TITLE = 0.6;
const W_LOCATION = 0.3;
const W_RECENCY = 0.1;

const TOKEN_RE = /[a-z0-9]{2,}/g;

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().match(TOKEN_RE) ?? []);
}

function unionTokens(items: string[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) for (const t of tokens(it)) out.add(t);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function titleScore(jobTitle: string, profile: Profile): number {
  return jaccard(tokens(jobTitle), unionTokens(profile.roles));
}

function recencyScore(postedAt: string | null, now: Date, windowDays: number): number {
  if (!postedAt) return 0.5;
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (ageDays <= 0) return 1;
  if (ageDays >= windowDays) return 0;
  return 1 - ageDays / windowDays;
}

function locationScore(jobLocation: string | null, profile: Profile): number {
  const loc = (jobLocation ?? "").toLowerCase();
  if (!loc) return 0;
  const isRemote = /\bremote\b/.test(loc);
  if (profile.preferences.remote && isRemote) return 1;

  const cities = profile.preferences.locations.map(s => s.toLowerCase()).filter(Boolean);
  for (const city of cities) {
    if (loc.includes(city.toLowerCase())) return 1;
  }
  const country = profile.preferences.country?.toLowerCase();
  if (country) {
    const re = new RegExp(`\\b${country.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`);
    if (re.test(loc)) return 0.5;
  }
  return 0;
}

export function scoreJob(
  job: Pick<Job, "title" | "location" | "posted_at" | "source_id">,
  profile: Profile,
  opts?: ScoreOpts
): number {
  const now = opts?.now ?? new Date();
  const windowDays = opts?.recencyWindowDays ?? 7;
  const t = titleScore(job.title, profile);
  const l = locationScore(job.location, profile);
  const r = recencyScore(job.posted_at, now, windowDays);
  return W_TITLE * t + W_LOCATION * l + W_RECENCY * r;
}

export function selectTopN(jobs: Job[], profile: Profile, n: number, opts?: ScoreOpts): Job[] {
  const scored = jobs.map(j => ({ job: j, score: scoreJob(j, profile, opts) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreak 1: prefer newer postings (ISO 8601 strings sort chronologically).
    const ap = a.job.posted_at ?? "";
    const bp = b.job.posted_at ?? "";
    if (ap !== bp) return bp.localeCompare(ap);
    // Tiebreak 2: source_id ascending — guarantees deterministic ordering for tests/cache stability.
    return a.job.source_id.localeCompare(b.job.source_id);
  });
  return scored.slice(0, n).map(s => s.job);
}
