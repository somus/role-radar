import type { FitWeights, JobFeedItem } from "../shared/types";
import { composite, dimensionsFromScoreFields, scoreGroup } from "../shared/score-weights";

export function applyWeightsToJobFeed(jobs: JobFeedItem[], weights: FitWeights): JobFeedItem[] {
  return jobs
    .map((job, index) => ({ job: applyWeightsToJob(job, weights), index }))
    .sort((a, b) => compareWeightedJobs(a.job, b.job, a.index, b.index))
    .map(({ job }) => job);
}

export function applyWeightsToJob(job: JobFeedItem, weights: FitWeights): JobFeedItem {
  if (
    job.skills_score === null
    || job.seniority_score === null
    || job.domain_score === null
    || job.location_score === null
  ) {
    return {
      ...job,
      weighted_composite: null,
      score_group: null,
    };
  }

  const weightedComposite = composite(dimensionsFromScoreFields({
    skills_score: job.skills_score,
    seniority_score: job.seniority_score,
    domain_score: job.domain_score,
    location_score: job.location_score,
  }), weights);

  return {
    ...job,
    weighted_composite: weightedComposite,
    score_group: scoreGroup(weightedComposite),
  };
}

function compareWeightedJobs(a: JobFeedItem, b: JobFeedItem, aIndex: number, bIndex: number): number {
  const aScored = a.weighted_composite !== null;
  const bScored = b.weighted_composite !== null;
  if (aScored !== bScored) return aScored ? -1 : 1;
  if (aScored && bScored && a.weighted_composite !== b.weighted_composite) {
    return b.weighted_composite! - a.weighted_composite!;
  }
  if (a.is_new !== b.is_new) return a.is_new ? -1 : 1;
  if (a.created_at !== b.created_at) return b.created_at.localeCompare(a.created_at);
  return aIndex - bIndex;
}
