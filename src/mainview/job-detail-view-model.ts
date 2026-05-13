import type { JobDetail } from "../shared/types";

export type ScoreTone = "green" | "yellow" | "red" | "muted";

export type DimensionRow = {
  key: "skills" | "seniority" | "domain" | "location";
  label: string;
  score: number | null;
  tone: ScoreTone;
};

export function scoreTone(score: number | null): ScoreTone {
  if (score == null) return "muted";
  if (score >= 80) return "green";
  if (score >= 65) return "yellow";
  return "red";
}

export function buildDimensionRows(job: JobDetail): DimensionRow[] {
  return [
    { key: "skills", label: "Skills", score: job.skills_score, tone: scoreTone(job.skills_score) },
    { key: "seniority", label: "Seniority", score: job.seniority_score, tone: scoreTone(job.seniority_score) },
    { key: "domain", label: "Domain", score: job.domain_score, tone: scoreTone(job.domain_score) },
    { key: "location", label: "Location", score: job.location_score, tone: scoreTone(job.location_score) },
  ];
}

export function isSelectedDetailCurrent(
  selectedJobId: number | null,
  detail: Pick<JobDetail, "id"> | null,
): boolean {
  return selectedJobId != null && detail?.id === selectedJobId;
}
