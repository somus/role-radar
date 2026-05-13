import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Rows3, Rows4, RotateCcw, SlidersHorizontal, Target } from "lucide-react";
import { electrobun } from "./electrobun";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_JOB_FEED_FILTERS, type FitWeights, type JobDetail, type JobFeedFilters, type JobFeedItem, type JobFeedResult } from "../shared/types";
import { DEFAULT_FIT_WEIGHTS, adjustWeights, type FitWeightKey } from "../shared/score-weights";
import { isSelectedDetailCurrent } from "./job-detail-view-model";
import { applyWeightsToJob, applyWeightsToJobFeed } from "./job-feed-rerank";
import { reconcileSelectedJobId } from "./job-feed-filters";
import { buildJobFeedSections, isFailedStatus, isPendingStatus } from "./job-feed-sections";
import { buildFeedStatusSummary, buildFilterChips, buildJobNextAction, type FeedStatusSummary, type FilterChip } from "./feed-view-model";
import { useJobReasoning } from "./use-job-reasoning";
import { JobDetailPanel, scoreBadgeClass } from "./JobDetailPanel";
import { cn } from "@/lib/utils";

const JOB_LIST_PAGE_SIZE = 200;
const WEIGHT_SAVE_DEBOUNCE_MS = 350;
const FILTER_SAVE_DEBOUNCE_MS = 250;

type SaveStatus = "saving" | "saved" | null;
type FeedDensity = "comfortable" | "compact";
const DENSITY_STORAGE_KEY = "roleRadar.jobFeedDensity";

function loadDensity(): FeedDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

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

function hasActiveFeedFilters(filters: JobFeedFilters): boolean {
  return (
    filters.minScore !== DEFAULT_JOB_FEED_FILTERS.minScore
    || filters.hideDealbreakers !== DEFAULT_JOB_FEED_FILTERS.hideDealbreakers
  );
}

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
  const reasoningState = useJobReasoning(selectedJobId);
  const [weights, setWeights] = useState<FitWeights>(DEFAULT_FIT_WEIGHTS);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightSaveStatus, setWeightSaveStatus] = useState<SaveStatus>(null);
  const [filters, setFilters] = useState<JobFeedFilters>(DEFAULT_JOB_FEED_FILTERS);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filterSaveStatus, setFilterSaveStatus] = useState<SaveStatus>(null);
  const [density, setDensity] = useState<FeedDensity>(loadDensity);
  const toggleDensity = useCallback(() => {
    setDensity((current) => {
      const next: FeedDensity = current === "comfortable" ? "compact" : "comfortable";
      try {
        window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
      } catch {
        // ignore storage errors (private mode, quota)
      }
      return next;
    });
  }, []);
  const weightsRef = useRef<FitWeights>(DEFAULT_FIT_WEIGHTS);
  const filtersRef = useRef<JobFeedFilters>(DEFAULT_JOB_FEED_FILTERS);
  const weightsSaveDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const filtersSaveDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const weightsSaveVersion = useRef(0);
  const filtersSaveVersion = useRef(0);

  const loadJobs = useCallback(async (pageOffset = 0, append = false) => {
    setLoading(true);
    try {
      const result: JobFeedResult = await electrobun.rpc.request.getJobFeed({
        limit: JOB_LIST_PAGE_SIZE,
        offset: pageOffset,
        filters: filtersRef.current,
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
        setSelectedJobId((current) => reconcileSelectedJobId(current, nextJobs));
        return nextJobs;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      electrobun.rpc.request.getWeights(),
      electrobun.rpc.request.getJobFeedFilters(),
    ])
      .then(([nextWeights, nextFilters]) => {
        if (cancelled) return;
        weightsRef.current = nextWeights;
        filtersRef.current = nextFilters;
        setWeights(nextWeights);
        setFilters(nextFilters);
        setWeightsError(null);
        setFiltersError(null);
        setWeightSaveStatus("saved");
        setFilterSaveStatus("saved");
        setJobs((currentJobs) => applyWeightsToJobFeed(currentJobs, nextWeights));
        setSelectedJob((currentJob) => currentJob ? applyWeightsToJob(currentJob, nextWeights) : currentJob);
        void loadJobs(0, false);
      })
      .catch((e: any) => {
        if (!cancelled) {
          const message = e.message ?? "Failed to load feed controls.";
          setWeightsError(message);
          setFiltersError(message);
          void loadJobs(0, false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, loadJobs]);

  const reloadDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(reloadDebounce.current);
      clearTimeout(weightsSaveDebounce.current);
      clearTimeout(filtersSaveDebounce.current);
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

  const scheduleFeedReload = useCallback(() => {
    clearTimeout(reloadDebounce.current);
    reloadDebounce.current = setTimeout(() => void loadJobs(0, false), 150);
  }, [loadJobs]);

  const persistFilters = useCallback((nextFilters: JobFeedFilters) => {
    const saveVersion = ++filtersSaveVersion.current;
    clearTimeout(filtersSaveDebounce.current);
    setFilterSaveStatus("saving");
    filtersSaveDebounce.current = setTimeout(() => {
      void electrobun.rpc.request.updateJobFeedFilters(nextFilters)
        .then((savedFilters) => {
          if (saveVersion !== filtersSaveVersion.current) return;
          filtersRef.current = savedFilters;
          setFilters(savedFilters);
          setFiltersError(null);
          setFilterSaveStatus("saved");
          scheduleFeedReload();
        })
        .catch((e: any) => {
          if (saveVersion !== filtersSaveVersion.current) return;
          setFiltersError(e.message ?? "Failed to save feed filters.");
          setFilterSaveStatus(null);
        });
    }, FILTER_SAVE_DEBOUNCE_MS);
  }, [scheduleFeedReload]);

  const applyMinScoreChange = useCallback((minScore: number) => {
    const nextFilters = {
      ...filtersRef.current,
      minScore,
    };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    setFiltersError(null);
    persistFilters(nextFilters);
    scheduleFeedReload();
  }, [persistFilters, scheduleFeedReload]);

  const applyHideDealbreakersChange = useCallback((hideDealbreakers: boolean) => {
    const nextFilters = {
      ...filtersRef.current,
      hideDealbreakers,
    };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    setFiltersError(null);
    persistFilters(nextFilters);
    scheduleFeedReload();
  }, [persistFilters, scheduleFeedReload]);

  const resetFilters = useCallback(() => {
    filtersRef.current = DEFAULT_JOB_FEED_FILTERS;
    setFilters(DEFAULT_JOB_FEED_FILTERS);
    setFiltersError(null);
    persistFilters(DEFAULT_JOB_FEED_FILTERS);
    scheduleFeedReload();
  }, [persistFilters, scheduleFeedReload]);

  const resetFeedControls = useCallback(() => {
    resetWeights();
    resetFilters();
  }, [resetFilters, resetWeights]);

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

  const selectJob = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setSelectedJob((current) => current?.id === jobId ? current : null);
  }, []);

  const sections = buildJobFeedSections(jobs);
  const flatJobs = sections.flatMap((section) => section.jobs);

  const handleListKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (flatJobs.length === 0) return;
    event.preventDefault();
    const currentIndex = flatJobs.findIndex((job) => job.id === selectedJobId);
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = 0;
    } else if (event.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, flatJobs.length - 1);
    } else {
      nextIndex = Math.max(currentIndex - 1, 0);
    }
    const nextJob = flatJobs[nextIndex];
    if (nextJob) selectJob(nextJob.id);
  }, [flatJobs, selectJob, selectedJobId]);

  const filtersActive = hasActiveFeedFilters(filters);
  const feedSummary = buildFeedStatusSummary(jobs, total, failedCount);
  const filterChips = buildFilterChips(filters, weights);

  if (!loading && jobs.length === 0) {
    return (
      <div className="space-y-3">
        <FeedCommandBar
          summary={feedSummary}
          filterChips={filterChips}
          fetchMoreResult={fetchMoreResult}
          fetchingMore={fetchingMore}
          showFetchMore={false}
          onFetchMore={() => {}}
          filtersActive={filtersActive}
          onClearFilters={resetFilters}
          density={density}
          onToggleDensity={toggleDensity}
        />
        <FeedControlsPanel
          weights={weights}
          weightsError={weightsError}
          weightSaveStatus={weightSaveStatus}
          filters={filters}
          filtersError={filtersError}
          filterSaveStatus={filterSaveStatus}
          onWeightChange={applyWeightChange}
          onMinScoreChange={applyMinScoreChange}
          onHideDealbreakersChange={applyHideDealbreakersChange}
          onReset={resetFeedControls}
          defaultOpen
        />
        <div className="space-y-3 border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm font-medium">
            {filtersActive
              ? "No jobs match the current feed filters."
              : hasSearched
                ? "No jobs found. Try different keywords or broaden your filters."
                : "No jobs yet. Run a search to discover jobs."}
          </p>
          <p className="mx-auto max-w-md text-xs leading-5 text-muted-foreground">
            {filtersActive
              ? "Clear the active filters to bring hidden jobs back into the list."
              : hasSearched
                ? "Generated searches can be too narrow. Create new queries or use manual search for a specific title and location."
                : "Use Discovery to find jobs from your profile. Scored roles will appear here as analysis finishes."}
          </p>
          {filtersActive && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    );
  }

  const selectedDetailCurrent = isSelectedDetailCurrent(selectedJobId, selectedJob);

  return (
    <div className="space-y-2">
      <FeedCommandBar
        summary={feedSummary}
        filterChips={filterChips}
        fetchMoreResult={fetchMoreResult}
        fetchingMore={fetchingMore}
        showFetchMore={total > 0}
        onFetchMore={() => {
          setFetchMoreResult(null);
          electrobun.rpc.send.fetchMoreJobs({ profileId });
        }}
        filtersActive={filtersActive}
        onClearFilters={resetFilters}
        density={density}
        onToggleDensity={toggleDensity}
      />

      <div className="grid min-h-[680px] overflow-hidden border border-border bg-background md:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
        <aside className="min-h-0 border-b border-border md:border-b-0 md:border-r">
          <div
            className="max-h-[680px] space-y-4 overflow-y-auto p-3"
            role="listbox"
            aria-label="Jobs"
            onKeyDown={handleListKeyDown}
          >
            <FeedControlsPanel
              weights={weights}
              weightsError={weightsError}
              weightSaveStatus={weightSaveStatus}
              filters={filters}
              filtersError={filtersError}
              filterSaveStatus={filterSaveStatus}
              onWeightChange={applyWeightChange}
              onMinScoreChange={applyMinScoreChange}
              onHideDealbreakersChange={applyHideDealbreakersChange}
              onReset={resetFeedControls}
              defaultOpen
            />
            {loading && jobs.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading jobs…</p>
            )}
            {sections.map((section) => (
              <div key={section.title} className="space-y-2">
                <div className={cn(
                  "flex items-center justify-between gap-2 bg-background px-1 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground",
                  section.sticky && "sticky top-0 z-10 border-b border-border",
                )}>
                  <p>{section.title}</p>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] tracking-normal">{section.count}</Badge>
                </div>
                {section.jobs.map((job) => (
                  <JobListItem
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJobId}
                    onSelect={() => selectJob(job.id)}
                    density={density}
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
          {!detailLoading && !detailError && !selectedJobId && (
            <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-sm text-muted-foreground">
              No job selected.
            </div>
          )}
          {!detailLoading && !detailError && selectedDetailCurrent && selectedJob && (
            <JobDetailPanel
              job={selectedJob}
              reasoningOpen={reasoningState.reasoningOpen}
              onReasoningOpenChange={reasoningState.setReasoningOpen}
              reasoning={reasoningState.reasoning}
              reasoningLoading={reasoningState.reasoningLoading}
              reasoningError={reasoningState.reasoningError}
            />
          )}
        </main>
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">
        <kbd className="mr-1 rounded border border-border bg-muted/40 px-1 py-px text-[10px]">↑↓</kbd>
        navigate
        <span className="mx-2 opacity-60">·</span>
        <kbd className="mr-1 rounded border border-border bg-muted/40 px-1 py-px text-[10px]">Enter</kbd>
        /
        <kbd className="ml-1 mr-1 rounded border border-border bg-muted/40 px-1 py-px text-[10px]">Space</kbd>
        select
      </p>
    </div>
  );
}

function FeedCommandBar({
  summary,
  filterChips,
  fetchMoreResult,
  fetchingMore,
  showFetchMore,
  onFetchMore,
  filtersActive,
  onClearFilters,
  density,
  onToggleDensity,
}: {
  summary: FeedStatusSummary;
  filterChips: FilterChip[];
  fetchMoreResult: number | null;
  fetchingMore: boolean;
  showFetchMore: boolean;
  onFetchMore: () => void;
  filtersActive: boolean;
  onClearFilters: () => void;
  density: FeedDensity;
  onToggleDensity: () => void;
}) {
  return (
    <section className="border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Job command center</p>
            <h2 className="text-base font-semibold tracking-tight">
              {summary.total > 0 ? `${summary.total} roles in view` : "No roles in view"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge icon={<CheckCircle2 className="size-3" />} label={`${summary.ready} scored`} />
            <StatusBadge icon={<Clock3 className="size-3" />} label={`${summary.pending} processing`} />
            {summary.newCount > 0 && <StatusBadge icon={<Target className="size-3" />} label={`${summary.newCount} new`} />}
            {summary.dealbreakerCount > 0 && <StatusBadge icon={<AlertTriangle className="size-3" />} label={`${summary.dealbreakerCount} dealbreaker`} tone="warning" />}
            {summary.failed > 0 && <StatusBadge icon={<AlertTriangle className="size-3" />} label={`${summary.failed} failed`} tone="danger" />}
          </div>
          {(filterChips.length > 0 || filtersActive) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filterChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant={chip.tone === "warning" ? "destructive" : chip.tone === "active" ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {chip.label}
                </Badge>
              ))}
              {filtersActive && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleDensity}
            title={density === "comfortable" ? "Switch to compact rows" : "Switch to comfortable rows"}
            aria-label={density === "comfortable" ? "Switch to compact rows" : "Switch to comfortable rows"}
          >
            {density === "comfortable" ? <Rows3 className="size-3.5" /> : <Rows4 className="size-3.5" />}
            {density === "comfortable" ? "Compact" : "Comfortable"}
          </Button>
          {showFetchMore && (
            <>
              {fetchMoreResult !== null && (
                <p className="text-xs text-muted-foreground">
                  {fetchMoreResult > 0 ? `${fetchMoreResult} new jobs found` : "No new jobs found"}
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={fetchingMore}
                onClick={onFetchMore}
              >
                {fetchingMore ? "Fetching…" : "Fetch More"}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({
  icon,
  label,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground",
        tone === "warning" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
        tone === "danger" && "border-red-300 bg-red-50 text-red-700 dark:border-destructive/40 dark:bg-destructive/10 dark:text-destructive",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function FeedControlsPanel({
  weights,
  weightsError,
  weightSaveStatus,
  filters,
  filtersError,
  filterSaveStatus,
  onWeightChange,
  onMinScoreChange,
  onHideDealbreakersChange,
  onReset,
  defaultOpen = false,
}: {
  weights: FitWeights;
  weightsError: string | null;
  weightSaveStatus: SaveStatus;
  filters: JobFeedFilters;
  filtersError: string | null;
  filterSaveStatus: SaveStatus;
  onWeightChange: (key: FitWeightKey, value: number) => void;
  onMinScoreChange: (value: number) => void;
  onHideDealbreakersChange: (checked: boolean) => void;
  onReset: () => void;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <section className="border border-border bg-muted/20">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group h-7 flex-1 justify-between rounded-none px-0 text-left text-xs font-medium">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                Ranking and filters
              </span>
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-2"
            onClick={onReset}
            title="Reset to defaults"
            aria-label="Reset feed controls to defaults"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="space-y-4 p-3">
            <div className="space-y-3">
              <label className="grid grid-cols-[70px_minmax(0,1fr)_34px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">Min score</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={filters.minScore}
                  onChange={(event) => onMinScoreChange(Number(event.currentTarget.value))}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <span className="text-right tabular-nums">{filters.minScore}</span>
              </label>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Hide dealbreakers</span>
                <Switch
                  size="sm"
                  checked={filters.hideDealbreakers}
                  onCheckedChange={onHideDealbreakersChange}
                  aria-label="Hide dealbreaker violations"
                />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-3">
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
            </div>
            {weightsError || filtersError ? (
              <p className="text-xs text-destructive">{weightsError ?? filtersError}</p>
            ) : weightSaveStatus === "saving" || filterSaveStatus === "saving" ? (
              <p className="text-xs text-muted-foreground">Saving…</p>
            ) : weightSaveStatus === "saved" || filterSaveStatus === "saved" ? (
              <p className="text-xs text-muted-foreground">Saved</p>
            ) : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function JobListItem({
  job,
  selected,
  onSelect,
  density,
}: {
  job: JobFeedItem;
  selected: boolean;
  onSelect: () => void;
  density: FeedDensity;
}) {
  const nextAction = buildJobNextAction(job);
  const compact = density === "compact";

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
      <CardContent className={cn("px-3", compact ? "py-1.5" : "py-2.5")}>
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
            {!compact && job.summary && (
              <p className="line-clamp-2 text-xs leading-5 text-foreground/75">{job.summary}</p>
            )}
            {!compact && (
              <div className="flex flex-wrap gap-1">
                {job.dealbreaker_violations.length > 0 && (
                  <Badge variant="outline" className="border-red-300 bg-red-50 px-1.5 py-0 text-[10px] text-red-700 dark:border-destructive/40 dark:bg-destructive/10 dark:text-destructive">
                    Dealbreaker
                  </Badge>
                )}
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
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {job.weighted_composite !== null && (
              <Badge className={scoreBadgeClass(job.score_group)}>
                {Math.round(job.weighted_composite)}
              </Badge>
            )}
            {!compact && job.posted_at && (
              <time className="whitespace-nowrap text-[10px] text-muted-foreground" dateTime={job.posted_at}>
                {formatDate(job.posted_at)}
              </time>
            )}
            {!compact && (
              <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">{nextAction}</span>
            )}
            {compact && job.dealbreaker_violations.length > 0 && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-red-300 bg-red-50 text-red-700 dark:border-destructive/40 dark:bg-destructive/10 dark:text-destructive">
                Dealbreaker
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
