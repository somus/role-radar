import { useEffect, useState, useCallback, useRef } from "react";
import { electrobun } from "./electrobun";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Job, JobFeedResult } from "../shared/types";

const FIRST_PAGE_SIZE = 200;
const LOAD_MORE_SIZE = 50;

type Props = {
  profileId: number;
  refreshKey: number;
  hasSearched?: boolean;
};

export function JobFeed({ profileId, refreshKey, hasSearched }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [fetchMoreResult, setFetchMoreResult] = useState<number | null>(null);

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

  if (!loading && jobs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        {hasSearched
          ? "No jobs found. Try different keywords or broaden your filters."
          : "No jobs yet. Run a search to discover jobs."}
      </p>
    );
  }

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

      {jobs.map((job) => (
        <Card key={job.id} className="hover:border-primary/30 transition-colors">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium truncate">{job.title}</h3>
                  {job.is_new && <Badge className="text-[10px] px-1.5 py-0">New</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {job.company}
                  {job.location && <> &middot; {job.location}</>}
                </p>
              </div>
              {job.posted_at && (
                <time className="text-[10px] text-muted-foreground whitespace-nowrap" dateTime={job.posted_at}>
                  {formatDate(job.posted_at)}
                </time>
              )}
            </div>
          </CardContent>
        </Card>
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
    </div>
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
