import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, RotateCcw } from "lucide-react";
import { electrobun } from "./electrobun";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { FitWeights, Gap, JobDetail, JobFeedItem, JobFeedResult, JobReasoning, Match, ScoreGroup } from "../shared/types";
import { DEFAULT_FIT_WEIGHTS, adjustWeights, type FitWeightKey } from "../shared/score-weights";
import { buildDimensionRows, isSelectedDetailCurrent, type DimensionRow, type ScoreTone } from "./job-detail-view-model";
import { applyWeightsToJob, applyWeightsToJobFeed } from "./job-feed-rerank";
import { buildJobFeedSections, isFailedStatus, isPendingStatus } from "./job-feed-sections";
import { cn } from "@/lib/utils";

const JOB_LIST_PAGE_SIZE = 200;
const WEIGHT_SAVE_DEBOUNCE_MS = 350;

type WeightSaveStatus = "saving" | "saved" | null;

type Props = {
  profileId: number;
  refreshKey: number;
  hasSearched?: boolean;
};

const WEIGHT_ROWS: Array<{ key: FitWeightKey; label: string }> = [
  { key: "skills", label: "Skills" },
  { key: "seniority", label: "Seniority" },
  { key: "domain", label: "Domain" },
  { key: "location", label: "Location" },
];

export function JobFeed({ profileId, refreshKey, hasSearched }: Props) {
  const [jobs, setJobs] = useState<JobFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [fetchMoreResult, setFetchMoreResult] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [reasoningLoading, setReasoningLoading] = useState(false);
  const [reasoningError, setReasoningError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<JobReasoning | null>(null);
  const [weights, setWeights] = useState<FitWeights>(DEFAULT_FIT_WEIGHTS);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightSaveStatus, setWeightSaveStatus] = useState<WeightSaveStatus>(null);
  const reasoningLoadedFor = useRef<number | null>(null);
  const weightsRef = useRef<FitWeights>(DEFAULT_FIT_WEIGHTS);
  const weightsSaveDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const weightsSaveVersion = useRef(0);

  const loadJobs = useCallback(async (pageOffset = 0, append = false) => {
    setLoading(true);
    try {
      const result: JobFeedResult = await electrobun.rpc.request.getJobFeed({
        limit: JOB_LIST_PAGE_SIZE,
        offset: pageOffset,
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
      setOffset(pageOffset + result.jobs.length);
      setFailedCount(result.failedCount);
      setJobs((currentJobs) => {
        const nextJobs = applyWeightsToJobFeed(
          append ? [...currentJobs, ...result.jobs] : result.jobs,
          weightsRef.current,
        );
        setSelectedJobId((current) => {
          if (nextJobs.length === 0) return null;
          if (current && nextJobs.some((job) => job.id === current)) return current;
          return nextJobs[0]!.id;
        });
        return nextJobs;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void electrobun.rpc.request.getWeights()
      .then((nextWeights) => {
        if (cancelled) return;
        weightsRef.current = nextWeights;
        setWeights(nextWeights);
        setWeightsError(null);
        setWeightSaveStatus("saved");
        setJobs((currentJobs) => applyWeightsToJobFeed(currentJobs, nextWeights));
        setSelectedJob((currentJob) => currentJob ? applyWeightsToJob(currentJob, nextWeights) : currentJob);
      })
      .catch((e: any) => {
        if (!cancelled) setWeightsError(e.message ?? "Failed to load scoring weights.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    void loadJobs(0, false);
  }, [refreshKey, loadJobs]);

  const reloadDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(reloadDebounce.current);
      clearTimeout(weightsSaveDebounce.current);
    };
  }, []);

  const persistWeights = useCallback((nextWeights: FitWeights) => {
    const saveVersion = ++weightsSaveVersion.current;
    clearTimeout(weightsSaveDebounce.current);
    setWeightSaveStatus("saving");
    weightsSaveDebounce.current = setTimeout(() => {
      void electrobun.rpc.request.updateWeights(nextWeights)
        .then((savedWeights) => {
          if (saveVersion !== weightsSaveVersion.current) return;
          weightsRef.current = savedWeights;
          setWeights(savedWeights);
          setWeightsError(null);
          setWeightSaveStatus("saved");
          setJobs((currentJobs) => applyWeightsToJobFeed(currentJobs, savedWeights));
          setSelectedJob((currentJob) => currentJob ? applyWeightsToJob(currentJob, savedWeights) : currentJob);
          void loadJobs(0, false);
        })
        .catch((e: any) => {
          if (saveVersion !== weightsSaveVersion.current) return;
          setWeightsError(e.message ?? "Failed to save scoring weights.");
          setWeightSaveStatus(null);
        });
    }, WEIGHT_SAVE_DEBOUNCE_MS);
  }, [loadJobs]);

  const applyWeightChange = useCallback((key: FitWeightKey, value: number) => {
    const nextWeights = adjustWeights(weightsRef.current, key, value);
    weightsRef.current = nextWeights;
    setWeights(nextWeights);
    setWeightsError(null);
    setJobs((currentJobs) => applyWeightsToJobFeed(currentJobs, nextWeights));
    setSelectedJob((currentJob) => currentJob ? applyWeightsToJob(currentJob, nextWeights) : currentJob);
    persistWeights(nextWeights);
  }, [persistWeights]);

  const resetWeights = useCallback(() => {
    weightsRef.current = DEFAULT_FIT_WEIGHTS;
    setWeights(DEFAULT_FIT_WEIGHTS);
    setWeightsError(null);
    setJobs((currentJobs) => applyWeightsToJobFeed(currentJobs, DEFAULT_FIT_WEIGHTS));
    setSelectedJob((currentJob) => currentJob ? applyWeightsToJob(currentJob, DEFAULT_FIT_WEIGHTS) : currentJob);
    persistWeights(DEFAULT_FIT_WEIGHTS);
  }, [persistWeights]);

  useEffect(() => {
    function handlePipeline(e: Event) {
      const { type, payload } = (e as CustomEvent).detail;
      if (type === "job:search:complete") {
        clearTimeout(reloadDebounce.current);
        reloadDebounce.current = setTimeout(() => void loadJobs(0, false), 500);
      } else if (type === "score:ready" || type === "score:failed" || type === "score:complete") {
        clearTimeout(reloadDebounce.current);
        reloadDebounce.current = setTimeout(() => void loadJobs(0, false), 150);
        if (type !== "score:complete") {
          const jobId = (payload as { jobId?: number })?.jobId;
          if (jobId && jobId === selectedJobId) setDetailRefreshKey((key) => key + 1);
        }
      } else if (type === "fetchmore:searching") {
        setFetchingMore(true);
        setFetchMoreResult(null);
      } else if (type === "fetchmore:complete") {
        setFetchingMore(false);
        setFetchMoreResult((payload as { jobsDiscovered: number }).jobsDiscovered);
        void loadJobs(0, false);
      } else if (type === "fetchmore:error") {
        setFetchingMore(false);
      }
    }
    window.addEventListener("pipeline-update", handlePipeline);
    return () => window.removeEventListener("pipeline-update", handlePipeline);
  }, [loadJobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }

    let cancelled = false;
    setSelectedJob((current) => current?.id === selectedJobId ? current : null);
    setDetailLoading(true);
    setDetailError(null);
    void electrobun.rpc.request.getJobDetail({ jobId: selectedJobId })
      .then((job) => {
        if (cancelled) return;
        if (!job) {
          setSelectedJob(null);
          setDetailError("Job details are no longer available.");
          return;
        }
        setSelectedJob(applyWeightsToJob(job, weightsRef.current));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setSelectedJob(null);
        setDetailError(e.message ?? "Failed to load job details.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedJobId, detailRefreshKey]);

  useEffect(() => {
    setReasoningOpen(false);
    setReasoning(null);
    setReasoningError(null);
    setReasoningLoading(false);
    reasoningLoadedFor.current = null;
  }, [selectedJobId]);

  useEffect(() => {
    if (!reasoningOpen || !selectedJobId || reasoningLoadedFor.current === selectedJobId) return;

    let cancelled = false;
    setReasoningLoading(true);
    setReasoningError(null);
    void electrobun.rpc.request.getJobReasoning({ jobId: selectedJobId })
      .then((payload) => {
        if (cancelled) return;
        setReasoning(payload);
        reasoningLoadedFor.current = selectedJobId;
      })
      .catch((e: any) => {
        if (cancelled) return;
        setReasoning(null);
        setReasoningError(e.message ?? "Failed to load reasoning.");
      })
      .finally(() => {
        if (!cancelled) setReasoningLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reasoningOpen, selectedJobId]);

  const selectJob = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setSelectedJob((current) => current?.id === jobId ? current : null);
  }, []);

  if (!loading && jobs.length === 0) {
    return (
      <div className="space-y-3">
        <ScoringWeightsPanel
          weights={weights}
          error={weightsError}
          saveStatus={weightSaveStatus}
          onWeightChange={applyWeightChange}
          onReset={resetWeights}
        />
        <p className="py-4 text-center text-xs text-muted-foreground">
          {hasSearched
            ? "No jobs found. Try different keywords or broaden your filters."
            : "No jobs yet. Run a search to discover jobs."}
        </p>
      </div>
    );
  }

  const sections = buildJobFeedSections(jobs);
  const selectedDetailCurrent = isSelectedDetailCurrent(selectedJobId, selectedJob);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          {total > 0 && (
            <p className="text-xs text-muted-foreground">
              {total} {total === 1 ? "job" : "jobs"}
            </p>
          )}
          {failedCount > 0 && (
            <p className="text-xs text-destructive">
              {failedCount} {failedCount === 1 ? "job" : "jobs"} failed to parse - selectors may need updating
            </p>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2">
            {fetchMoreResult !== null && (
              <p className="text-xs text-muted-foreground">
                {fetchMoreResult > 0 ? `${fetchMoreResult} new jobs found` : "No new jobs found"}
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={fetchingMore}
              onClick={() => {
                setFetchMoreResult(null);
                electrobun.rpc.send.fetchMoreJobs({ profileId });
              }}
            >
              {fetchingMore ? "Fetching…" : "Fetch More"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-[680px] overflow-hidden border border-border bg-background md:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
        <aside className="min-h-0 border-b border-border md:border-b-0 md:border-r">
          <div className="max-h-[680px] space-y-4 overflow-y-auto p-3" role="listbox" aria-label="Jobs">
            <ScoringWeightsPanel
              weights={weights}
              error={weightsError}
              saveStatus={weightSaveStatus}
              onWeightChange={applyWeightChange}
              onReset={resetWeights}
            />
            {loading && jobs.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading jobs…</p>
            )}
            {sections.map((section) => (
              <div key={section.title} className="space-y-2">
                <p className="px-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{section.title}</p>
                {section.jobs.map((job) => (
                  <JobListItem
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJobId}
                    onSelect={() => selectJob(job.id)}
                  />
                ))}
              </div>
            ))}
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => void loadJobs(offset, true)}
              >
                {loading ? "Loading…" : `Load More Jobs (${jobs.length}/${total})`}
              </Button>
            )}
          </div>
        </aside>

        <main className="min-h-0">
          {detailLoading && (
            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
              Loading job details…
            </div>
          )}
          {!detailLoading && detailError && (
            <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-sm text-destructive">
              {detailError}
            </div>
          )}
          {!detailLoading && !detailError && !selectedDetailCurrent && selectedJobId && (
            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
              Loading job details…
            </div>
          )}
          {!detailLoading && !detailError && selectedDetailCurrent && selectedJob && (
            <JobDetailPanel
              job={selectedJob}
              reasoningOpen={reasoningOpen}
              onReasoningOpenChange={setReasoningOpen}
              reasoning={reasoning}
              reasoningLoading={reasoningLoading}
              reasoningError={reasoningError}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ScoringWeightsPanel({
  weights,
  error,
  saveStatus,
  onWeightChange,
  onReset,
}: {
  weights: FitWeights;
  error: string | null;
  saveStatus: WeightSaveStatus;
  onWeightChange: (key: FitWeightKey, value: number) => void;
  onReset: () => void;
}) {
  return (
    <Collapsible defaultOpen={false}>
      <section className="border border-border bg-muted/20">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group h-7 flex-1 justify-between rounded-none px-0 text-left text-xs font-medium">
              <span>Scoring weights</span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-2"
            onClick={onReset}
            title="Reset to defaults"
            aria-label="Reset scoring weights to defaults"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="space-y-3 p-3">
            {WEIGHT_ROWS.map((row) => (
              <label key={row.key} className="grid grid-cols-[70px_minmax(0,1fr)_34px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[row.key]}
                  onChange={(event) => onWeightChange(row.key, Number(event.currentTarget.value))}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <span className="text-right tabular-nums">{weights[row.key]}%</span>
              </label>
            ))}
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : saveStatus ? (
              <p className="text-xs text-muted-foreground">{saveStatus === "saving" ? "Saving..." : "Saved"}</p>
            ) : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function JobListItem({ job, selected, onSelect }: { job: JobFeedItem; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      className={cn(
        "cursor-pointer rounded-none transition-colors hover:border-primary/40",
        selected && "border-primary bg-primary/5",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      role="option"
      aria-selected={selected}
      tabIndex={0}
    >
      <CardContent className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate text-sm font-medium">{job.title}</h3>
              {job.is_new && <Badge className="px-1.5 py-0 text-[10px]">New</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {job.company ?? "Unknown company"}
              {job.location && <> · {job.location}</>}
            </p>
            <div className="flex flex-wrap gap-1">
              {job.overqualified && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Overqualified</Badge>}
              {job.weighted_composite === null && isPendingStatus(job.status) && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Scoring</Badge>
              )}
              {isFailedStatus(job.status) && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {job.status === "fetch_failed" ? "Fetch Failed" : "Score Failed"}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {job.weighted_composite !== null && (
              <Badge className={scoreBadgeClass(job.score_group)}>
                {Math.round(job.weighted_composite)}
              </Badge>
            )}
            {job.posted_at && (
              <time className="whitespace-nowrap text-[10px] text-muted-foreground" dateTime={job.posted_at}>
                {formatDate(job.posted_at)}
              </time>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function JobDetailPanel({
  job,
  reasoningOpen,
  onReasoningOpenChange,
  reasoning,
  reasoningLoading,
  reasoningError,
}: {
  job: JobDetail;
  reasoningOpen: boolean;
  onReasoningOpenChange: (open: boolean) => void;
  reasoning: JobReasoning | null;
  reasoningLoading: boolean;
  reasoningError: string | null;
}) {
  const dimensions = buildDimensionRows(job);

  return (
    <div className="max-h-[680px] overflow-y-auto">
      <div className="space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
              <p className="text-sm text-muted-foreground">
                {job.company ?? "Unknown company"}
                {job.location && <> · {job.location}</>}
              </p>
            </div>
            {job.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={job.url} target="_blank" rel="noreferrer">Open Posting</a>
              </Button>
            )}
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Fit Score</p>
              <p className="text-5xl font-semibold tracking-tight">
                {job.weighted_composite !== null ? Math.round(job.weighted_composite) : "--"}
              </p>
            </div>
            {job.score_group && <Badge className={scoreBadgeClass(job.score_group)}>{scoreGroupLabel(job.score_group)}</Badge>}
            {job.status === "fetch_failed" && <Badge variant="outline">Fetch Failed</Badge>}
            {job.status === "score_failed" && <Badge variant="outline">Score Failed</Badge>}
          </div>

          {job.overqualified && (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              This role appears below your current seniority. Treat the score as a fit signal, not a level match.
            </div>
          )}

          {job.summary && <p className="max-w-3xl text-sm text-foreground/90">{job.summary}</p>}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Dimension Scores</h3>
          <div className="space-y-3">
            {dimensions.map((row) => (
              <DimensionProgress key={row.key} row={row} />
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <InsightSection title="Matches" items={job.matches} tone="match" emptyText="No structured matches saved yet." />
          <InsightSection title="Gaps" items={job.gaps} tone="gap" emptyText="No structured gaps saved yet." />
        </div>

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Job Description</h3>
          {job.description ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-3 text-sm leading-6 text-foreground/90 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground/90">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              }}
            >
              {job.description}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">No full description saved for this job yet.</p>
          )}
        </section>

        <Collapsible open={reasoningOpen} onOpenChange={onReasoningOpenChange}>
          <section className="border border-border">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex w-full justify-between rounded-none px-3 py-2 text-left">
                <span>View reasoning</span>
                <ChevronDown className={cn("size-4 transition-transform", reasoningOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t border-border p-3">
                {reasoningLoading && <p className="text-sm text-muted-foreground">Loading reasoning…</p>}
                {!reasoningLoading && reasoningError && <p className="text-sm text-destructive">{reasoningError}</p>}
                {!reasoningLoading && !reasoningError && !reasoning && (
                  <p className="text-sm text-muted-foreground">No reasoning payload has been saved for this job yet.</p>
                )}
                {!reasoningLoading && !reasoningError && reasoning && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Model: {reasoning.model}</p>
                    <ReasoningBlock title="Prompt" value={reasoning.prompt} />
                    <ReasoningBlock title="Response" value={reasoning.response} />
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      </div>
    </div>
  );
}

function DimensionProgress({ row }: { row: DimensionRow }) {
  const score = row.score ?? 0;

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)_42px] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{row.label}</span>
      <div className="h-2 overflow-hidden bg-muted">
        <div className={cn("h-full", scoreFillClass(row.tone))} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="text-right font-medium">{row.score ?? "--"}</span>
    </div>
  );
}

function InsightSection({
  title,
  items,
  tone,
  emptyText,
}: {
  title: string;
  items: Array<Match | Gap>;
  tone: "match" | "gap";
  emptyText: string;
}) {
  return (
    <section className={cn("space-y-3 border p-3", tone === "match" ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70")}>
      <h3 className={cn("text-xs font-medium uppercase tracking-[0.18em]", tone === "match" ? "text-emerald-900" : "text-amber-950")}>
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.skill}-${item.type}-${item.context}`} className="border border-background/80 bg-background/80 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.skill}</p>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">{item.type}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-foreground/80">{item.context}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function ReasoningBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h4>
      <pre className="max-h-56 overflow-auto border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
        {value}
      </pre>
    </section>
  );
}

function scoreBadgeClass(group: ScoreGroup | null): string {
  if (group === "Top") return "bg-emerald-600 text-white hover:bg-emerald-600";
  if (group === "Good") return "bg-amber-500 text-amber-950 hover:bg-amber-500";
  return "bg-red-600 text-white hover:bg-red-600";
}

function scoreFillClass(tone: ScoreTone): string {
  if (tone === "green") return "bg-emerald-600";
  if (tone === "yellow") return "bg-amber-500";
  if (tone === "red") return "bg-red-600";
  return "bg-muted-foreground/30";
}

function scoreGroupLabel(group: ScoreGroup): string {
  if (group === "Top") return "Top Match";
  if (group === "Good") return "Good Match";
  return "Other";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
