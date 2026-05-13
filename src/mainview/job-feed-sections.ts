import type { JobFeedItem, ScoreGroup } from "../shared/types";

export type JobFeedSection = {
  title: string;
  jobs: JobFeedItem[];
};

const ORDERED_GROUPS: ScoreGroup[] = ["Top", "Good", "Others"];

export function buildJobFeedSections(jobs: JobFeedItem[]): JobFeedSection[] {
  const sections: JobFeedSection[] = [];

  for (const group of ORDERED_GROUPS) {
    const groupJobs = jobs.filter((job) => job.score_group === group);
    if (groupJobs.length > 0) {
      sections.push({
        title: group === "Top" ? "Top Matches" : group === "Good" ? "Good Matches" : "Others",
        jobs: groupJobs,
      });
    }
  }

  const pending = jobs.filter((job) => isPendingStatus(job.status) && job.score_group === null);
  if (pending.length > 0) {
    sections.push({ title: "Still Processing", jobs: pending });
  }

  const failed = jobs.filter((job) => isFailedStatus(job.status));
  if (failed.length > 0) {
    sections.push({ title: "Needs Attention", jobs: failed });
  }

  return sections;
}

export function isPendingStatus(status: string): boolean {
  return (
    status === "discovered" ||
    status === "queued" ||
    status === "fetching" ||
    status === "ready_for_scoring" ||
    status === "scoring"
  );
}

export function isFailedStatus(status: string): boolean {
  return status === "fetch_failed" || status === "score_failed";
}
