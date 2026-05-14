import type { Job, JobSourceId, ParsedJob, PostedAtConfidence } from "../../shared/types";

type JobDefaults = Partial<Job> & { id?: number };

export function makeTestJob(overrides: JobDefaults = {}): Job {
  return {
    id: 1,
    source: "linkedin" as JobSourceId,
    source_id: "test_1",
    title: "Backend Engineer",
    company: "Acme",
    location: "San Francisco, CA",
    url: "https://example.com/jobs/1",
    posted_at: null,
    posted_at_ts: null,
    posted_at_confidence: "missing" as PostedAtConfidence,
    posted_text: null,
    description_excerpt_only: false,
    canonical_job_id: null,
    dedup_key: null,
    status: "discovered",
    description: null,
    seniority_level: null,
    employment_type: null,
    job_function: null,
    industry: null,
    heuristic_score: null,
    resume_generated: false,
    is_new: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

export function makeTestParsedJob(overrides: Partial<ParsedJob> = {}): ParsedJob {
  return {
    source: "linkedin" as JobSourceId,
    sourceId: "test_1",
    title: "Backend Engineer",
    company: "Acme Corp",
    location: "San Francisco, CA",
    url: "https://linkedin.com/jobs/view/test_1/",
    postedAt: "2026-04-25",
    postedText: "2026-04-25",
    postedAtConfidence: "exact" as PostedAtConfidence,
    descriptionExcerptOnly: false,
    status: "discovered",
    ...overrides,
  };
}
