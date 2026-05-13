import ReactMarkdown from "react-markdown";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Gap, JobDetail, JobReasoning, Match, ScoreGroup } from "../shared/types";
import { buildDimensionRows, type DimensionRow, type ScoreTone } from "./job-detail-view-model";
import { buildJobDecisionSummary } from "./feed-view-model";
import { cn } from "@/lib/utils";

export function JobDetailPanel({
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
  const decisionSummary = buildJobDecisionSummary(job);

  return (
    <div className="max-h-[680px] overflow-y-auto">
      <div className="space-y-6 p-6">
        <header className="space-y-4">
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
                <a href={job.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open Posting
                </a>
              </Button>
            )}
          </div>
          <div className="border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Decision summary</p>
            <p className="mt-1 text-sm leading-6 text-foreground/90">{decisionSummary}</p>
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
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              This role appears below your current seniority. Treat the score as a fit signal, not a level match.
            </div>
          )}

          {job.dealbreaker_violations.length > 0 && (
            <div className="space-y-2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-destructive/40 dark:bg-destructive/10 dark:text-destructive">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-red-300 bg-background/70 text-red-700 dark:border-destructive/40 dark:bg-background/40 dark:text-destructive">Dealbreaker</Badge>
                <p className="font-medium">Profile dealbreaker violated</p>
              </div>
              <ul className="space-y-1">
                {job.dealbreaker_violations.map((violation) => (
                  <li key={`${violation.dealbreaker}-${violation.reason}`} className="text-xs leading-5">
                    <span className="font-medium">{violation.dealbreaker}:</span> {violation.reason}
                  </li>
                ))}
              </ul>
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
                <span className="flex flex-col items-start">
                  <span className="text-sm">Advanced diagnostics</span>
                  <span className="text-[11px] font-normal text-muted-foreground">Raw model prompt and response used to score this role.</span>
                </span>
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
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)_42px] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{row.label}</span>
      <div
        className="h-2 overflow-hidden bg-muted"
        role="progressbar"
        aria-label={`${row.label} score`}
        aria-valuenow={row.score ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full", scoreFillClass(row.tone))} style={{ width: `${clamped}%` }} />
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
    <section className={cn("space-y-3 border p-3", tone === "match" ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/5")}>
      <h3 className={cn("text-xs font-medium uppercase tracking-[0.18em]", tone === "match" ? "text-emerald-900 dark:text-emerald-300" : "text-amber-950 dark:text-amber-300")}>
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

export function scoreBadgeClass(group: ScoreGroup | null): string {
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
