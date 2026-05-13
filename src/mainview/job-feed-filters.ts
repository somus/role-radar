import type { JobFeedFilters, JobFeedItem } from "../shared/types";

export function applyJobFeedFilters(jobs: JobFeedItem[], filters: JobFeedFilters): JobFeedItem[] {
  return jobs.filter((job) => {
    if (job.weighted_composite !== null && job.weighted_composite < filters.minScore) return false;
    if (filters.hideDealbreakers && job.dealbreaker_violations.length > 0) return false;
    return true;
  });
}

export function reconcileSelectedJobId(current: number | null, jobs: JobFeedItem[]): number | null {
  if (jobs.length === 0) return null;
  if (current && jobs.some((job) => job.id === current)) return current;
  return jobs[0]!.id;
}
