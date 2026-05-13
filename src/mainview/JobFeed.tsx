import { useEffect, useState, useCallback, useRef } from "react";
import { electrobun } from "./electrobun";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { JobFeedItem, JobFeedResult, JobScoreDetail, ScoreGroup } from "../shared/types";
import { buildJobFeedSections, isFailedStatus, isPendingStatus } from "./job-feed-sections";

const FIRST_PAGE_SIZE = 200;
const LOAD_MORE_SIZE = 50;

type Props = {
  profileId: number;
  refreshKey: number;
  hasSearched?: boolean;
};

export function JobFeed({ profileId, refreshKey, hasSearched }: Props) {
  const [jobs, setJobs] = useState<JobFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [fetchMoreResult, setFetchMoreResult] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobScoreDetail | null>(null);

  const loadPage = useCallback(async (pageOffset: number, append: boolean) => {
    setLoading(true);
    const limit = pageOffset === 0 ? FIRST_PAGE_SIZE : LOAD_MORE_SIZE;
    try {
      const result: JobFeedResult = await electrobun.rpc.request.getJobFeed({
        limit,
        offset: pageOffset,
      });
      setJobs(prev => append ? [...prev, ...result.jobs] : result.jobs);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setFailedCount(result.failedCount);
      setOffset(pageOffset + limit);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
  }, [refreshKey, loadPage]);

  const reloadDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(reloadDebounce.current);
  }, []);

  useEffect(() => {
    function handlePipeline(e: Event) {
      const { type, payload } = (e as CustomEvent).detail;
      if (type === "job:search:complete") {
        clearTimeout(reloadDebounce.current);
        reloadDebounce.current = setTimeout(() => loadPage(0, false), 500);
      } else if (type === "score:ready" || type === "score:failed" || type === "score:complete") {
        clearTimeout(reloadDebounce.current);
        reloadDebounce.current = setTimeout(() => loadPage(0, false), 150);
      } else if (type === "fetchmore:searching") {
        setFetchingMore(true);
        setFetchMoreResult(null);
      } else if (type === "fetchmore:complete") {
        setFetchingMore(false);
        setFetchMoreResult((payload as { jobsDiscovered: number }).jobsDiscovered);
        loadPage(0, false);
      } else if (type === "fetchmore:error") {
        setFetchingMore(false);
      }
    }
    window.addEventListener("pipeline-update", handlePipeline);
    return () => window.removeEventListener("pipeline-update", handlePipeline);
  }, [loadPage]);

  const openJobDetail = useCallback(async (jobId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const job = await electrobun.rpc.request.getJobWithScore({ jobId });
      if (!job) {
        setSelectedJob(null);
        setDetailError("Job details are no longer available.");
        return;
      }
      setSelectedJob(job);
    } catch (e: any) {
      setSelectedJob(null);
      setDetailError(e.message ?? "Failed to load job details");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  if (!loading && jobs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        {hasSearched
          ? "No jobs found. Try different keywords or broaden your filters."
          : "No jobs yet. Run a search to discover jobs."}
      </p>
    );
  }

  const sections = buildJobFeedSections(jobs);

  return (
    <div className="space-y-2">
      {total > 0 && (
        <p className="text-xs text-muted-foreground">{total} {total === 1 ? "job" : "jobs"}</p>
      )}
      {failedCount > 0 && (
        <p className="text-xs text-destructive">
          {failedCount} {failedCount === 1 ? "job" : "jobs"} failed to parse — selectors may need updating
        </p>
      )}

      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{section.title}</p>
          {section.jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => void openJobDetail(job.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{job.title}</h3>
                      {job.is_new && <Badge className="text-[10px] px-1.5 py-0">New</Badge>}
                      {job.overqualified && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Overqualified</Badge>}
                      {job.weighted_composite === null && isPendingStatus(job.status) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Scoring</Badge>
                      )}
                      {job.status === "fetch_failed" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Fetch Failed</Badge>
                      )}
                      {job.status === "score_failed" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Score Failed</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.company}
                      {job.location && <> &middot; {job.location}</>}
                    </p>
                    {job.summary && (
                      <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{job.summary}</p>
                    )}
                    {job.status === "fetch_failed" && (
                      <p className="text-xs text-destructive mt-1">
                        We could not fetch job details for this listing.
                      </p>
                    )}
                    {job.status === "score_failed" && (
                      <p className="text-xs text-destructive mt-1">
                        Detailed fit scoring failed for this job.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {job.weighted_composite !== null && (
                      <Badge className={scoreBadgeClass(job.score_group)}>
                        {Math.round(job.weighted_composite)}
                      </Badge>
                    )}
                    {job.posted_at && (
                      <time className="text-[10px] text-muted-foreground whitespace-nowrap" dateTime={job.posted_at}>
                        {formatDate(job.posted_at)}
                      </time>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={loading}
          onClick={() => loadPage(offset, true)}
        >
          {loading ? "Loading..." : "Show more"}
        </Button>
      )}

      {total > 0 && !hasMore && (
        <div className="space-y-1.5 pt-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={fetchingMore}
            onClick={() => {
              setFetchMoreResult(null);
              electrobun.rpc.send.fetchMoreJobs({ profileId });
            }}
          >
            {fetchingMore ? "Fetching more jobs..." : "Fetch More Jobs from LinkedIn"}
          </Button>
          {fetchMoreResult !== null && (
            <p className="text-xs text-muted-foreground text-center">
              {fetchMoreResult > 0 ? `${fetchMoreResult} new jobs found` : "No new jobs found"}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={detailOpen} onOpenChange={setDetailOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedJob?.title ?? "Job Details"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedJob?.company ?? "Unknown company"}
              {selectedJob?.location ? ` · ${selectedJob.location}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {detailLoading && <p className="text-sm text-muted-foreground">Loading job details...</p>}
          {!detailLoading && detailError && <p className="text-sm text-destructive">{detailError}</p>}
          {!detailLoading && !detailError && selectedJob && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {selectedJob.weighted_composite !== null && (
                  <Badge className={scoreBadgeClass(selectedJob.score_group)}>
                    Score {Math.round(selectedJob.weighted_composite)}
                  </Badge>
                )}
                {selectedJob.overqualified && <Badge variant="outline">Overqualified</Badge>}
                {selectedJob.status === "fetch_failed" && <Badge variant="outline">Fetch Failed</Badge>}
                {selectedJob.status === "score_failed" && <Badge variant="outline">Score Failed</Badge>}
              </div>

              {selectedJob.summary && (
                <section className="space-y-1">
                  <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Summary</h4>
                  <p className="text-sm text-foreground/90">{selectedJob.summary}</p>
                </section>
              )}

              {selectedJob.weighted_composite !== null && (
                <section className="space-y-2">
                  <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Score Breakdown</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p>Skills: {selectedJob.skills_score ?? "-"}</p>
                    <p>Seniority: {selectedJob.seniority_score ?? "-"}</p>
                    <p>Domain: {selectedJob.domain_score ?? "-"}</p>
                    <p>Location: {selectedJob.location_score ?? "-"}</p>
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Matches</h4>
                {selectedJob.matches.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {selectedJob.matches.map((match, index) => (
                      <li key={`${match.skill}-${index}`} className="border border-border/60 p-2">
                        <p className="font-medium">{match.skill}</p>
                        <p className="text-xs text-muted-foreground">{match.type}</p>
                        <p className="text-xs text-foreground/80 mt-1">{match.context}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No structured matches saved yet.</p>
                )}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Gaps</h4>
                {selectedJob.gaps.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {selectedJob.gaps.map((gap, index) => (
                      <li key={`${gap.skill}-${index}`} className="border border-border/60 p-2">
                        <p className="font-medium">{gap.skill}</p>
                        <p className="text-xs text-muted-foreground">{gap.type}</p>
                        <p className="text-xs text-foreground/80 mt-1">{gap.context}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No structured gaps saved yet.</p>
                )}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Reasoning</h4>
                {selectedJob.reasoning_response ? (
                  <div className="space-y-2">
                    {selectedJob.reasoning_model && (
                      <p className="text-xs text-muted-foreground">Model: {selectedJob.reasoning_model}</p>
                    )}
                    <pre className="max-h-56 overflow-auto border border-border/60 bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                      {selectedJob.reasoning_response}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No reasoning payload has been saved for this job yet.
                  </p>
                )}
              </section>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDetailError(null);
                setSelectedJob(null);
              }}
            >
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function scoreBadgeClass(group: ScoreGroup | null): string {
  if (group === "Top") return "bg-emerald-600 text-white hover:bg-emerald-600";
  if (group === "Good") return "bg-sky-600 text-white hover:bg-sky-600";
  return "bg-zinc-600 text-white hover:bg-zinc-600";
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
