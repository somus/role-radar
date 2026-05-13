import { DEFAULT_FIT_WEIGHTS, type FitWeightKey } from "../shared/score-weights";
import type { FitWeights, JobDetail, JobFeedFilters, JobFeedItem } from "../shared/types";
import { isFailedStatus, isPendingStatus } from "./job-feed-sections";

export type FeedStatusSummary = {
  total: number;
  ready: number;
  pending: number;
  failed: number;
  newCount: number;
  dealbreakerCount: number;
};

export type FilterChip = {
  key: string;
  label: string;
  tone: "neutral" | "active" | "warning";
};

const WEIGHT_LABELS: Record<FitWeightKey, string> = {
  skills: "Skills",
  seniority: "Seniority",
  domain: "Domain",
  location: "Location",
};

export function buildFeedStatusSummary(
  jobs: JobFeedItem[],
  total: number,
  failedCount: number,
): FeedStatusSummary {
  return {
    total,
    ready: jobs.filter((job) => job.weighted_composite !== null).length,
    pending: jobs.filter((job) => isPendingStatus(job.status)).length,
    failed: failedCount,
    newCount: jobs.filter((job) => job.is_new).length,
    dealbreakerCount: jobs.filter((job) => job.dealbreaker_violations.length > 0).length,
  };
}

export function buildFilterChips(filters: JobFeedFilters, weights: FitWeights): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.minScore > 0) {
    chips.push({ key: "min-score", label: `Score ${filters.minScore}+`, tone: "active" });
  }

  if (filters.hideDealbreakers) {
    chips.push({ key: "dealbreakers", label: "Dealbreakers hidden", tone: "warning" });
  }

  for (const key of Object.keys(weights) as FitWeightKey[]) {
    if (weights[key] !== DEFAULT_FIT_WEIGHTS[key]) {
      chips.push({ key: `weight-${key}`, label: `${WEIGHT_LABELS[key]} ${weights[key]}%`, tone: "neutral" });
    }
  }

  return chips;
}

export function buildJobNextAction(job: Pick<JobFeedItem, "status" | "weighted_composite" | "score_group" | "dealbreaker_violations" | "url">): string {
  if (isFailedStatus(job.status)) return "Review failure";
  if (isPendingStatus(job.status) || job.weighted_composite === null) return "Await score";
  if (job.dealbreaker_violations.length > 0) return "Check constraint";
  if (job.score_group === "Top") return job.url ? "Open posting" : "Review match";
  if (job.score_group === "Good") return "Review gaps";
  return "Skim details";
}

export function buildJobDecisionSummary(job: JobDetail): string {
  if (isFailedStatus(job.status)) {
    return job.status === "fetch_failed"
      ? "Role details could not be fetched. Retry or fetch more roles before judging fit."
      : "Scoring failed for this role. The listing is still saved, but the fit assessment is unavailable.";
  }

  if (isPendingStatus(job.status) || job.weighted_composite === null) {
    return "This role is still moving through detail fetch and scoring. Keep reviewing scored matches while it finishes.";
  }

  if (job.dealbreaker_violations.length > 0) {
    return "Strong matches may still be wrong to pursue when they violate a hard constraint. Review the dealbreaker before opening the posting.";
  }

  if (job.score_group === "Top") {
    return job.url
      ? "This is one of the best current matches. Check the gaps, then open the posting if the role still fits your intent."
      : "This is one of the best current matches. Check the gaps, then look up the company directly — no posting URL was captured.";
  }

  if (job.score_group === "Good") {
    return "This role has a workable fit with tradeoffs. Use the gaps to decide whether it is worth tailoring for.";
  }

  return "This role is lower priority. Skim the summary and only continue if the company or role has unusual appeal.";
}

