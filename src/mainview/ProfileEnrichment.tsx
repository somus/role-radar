import { useForm, Controller } from "react-hook-form";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { OnboardingProgress } from "./OnboardingProgress";
import { useEnrichmentQuestions } from "./use-enrichment-questions";
import type { Profile, EnrichmentAnswer } from "../shared/types";

type Props = {
  profile: Profile;
  forceRegenerate?: boolean;
  onComplete: (profile: Profile) => void;
  onSkip: () => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  career_intent: "Career Intent",
  problem_solving: "Problem Solving",
  technical_depth: "Technical Depth",
};

const ENRICHMENT_ANSWER_MAX_CHARS = 5000;

type FormValues = Record<string, string>;

export function ProfileEnrichment({ profile, forceRegenerate, onComplete, onSkip }: Props) {
  const form = useForm<FormValues>({ defaultValues: {} });
  const watchedValues = form.watch();
  const hasAnswers = Object.values(watchedValues).some((v) => v.trim().length > 0);

  const enrichment = useEnrichmentQuestions(
    profile,
    forceRegenerate,
    {
      onQuestions: (qs) => {
        const defaults: FormValues = {};
        qs.forEach((_, i) => { defaults[`q${i}`] = ""; });
        form.reset(defaults);

        if (forceRegenerate) return;

        electrobun.rpc.request.getEnrichmentAnswers({ profileId: profile.id }).then((saved) => {
          if (saved.length === 0) return;
          const answersByQuestion = new Map(saved.map((answer) => [answer.question, answer.answer]));
          const prefilled: FormValues = {};
          for (let i = 0; i < qs.length; i++) {
            prefilled[`q${i}`] = answersByQuestion.get(qs[i]!.question) ?? "";
          }
          form.reset(prefilled);
        }).catch((e) => { console.error("[enrichment] Failed to load saved answers:", e); });
      },
      onComplete,
    },
    onSkip,
  );

  const { questions, loading, submitting, error, errorPhase, beginSubmit, retry } = enrichment;

  function onSubmit(data: FormValues) {
    beginSubmit();

    const enrichmentAnswers: EnrichmentAnswer[] = [];
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]!;
      const answer = (data[`q${i}`] ?? "").trim();
      if (answer.length === 0) continue;
      enrichmentAnswers.push({
        question: question.question,
        answer,
        category: question.category,
      });
    }

    electrobun.rpc.send.processEnrichmentAnswers({
      profileId: profile.id,
      answers: enrichmentAnswers,
    });
  }

  function handleRetry() {
    if (errorPhase === "submit") {
      form.handleSubmit(onSubmit)();
    } else {
      retry("generate");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-10">
          <OnboardingProgress current="enrichment" />
          <div className="max-w-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">Generating profile questions</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground animate-pulse">
              Role Radar is turning your resume into targeted questions about goals, constraints, and concrete project stories.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        <OnboardingProgress current="enrichment" />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Profile context</p>
            <h1 className="text-2xl font-semibold tracking-tight">Add the details your resume cannot show</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              These answers improve ranking by capturing goals, hard constraints, and concrete stories. Empty answers are ignored.
            </p>
          </div>
          <aside className="border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
            Dealbreakers from this step can flag or hide otherwise high-scoring jobs, so use direct language like "no onsite" or "no agencies".
          </aside>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {questions.map((q, i) => (
            <Card key={q.question}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABELS[q.category] ?? q.category}
                  </Badge>
                </div>
                <CardTitle className="text-base leading-relaxed">{q.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <Controller
                  name={`q${i}`}
                  control={form.control}
                  render={({ field }) => {
                    const length = field.value?.length ?? 0;
                    const over = length > ENRICHMENT_ANSWER_MAX_CHARS;
                    return (
                      <Field>
                        <FieldLabel className="text-xs text-muted-foreground">{q.guided_prompt}</FieldLabel>
                        <Textarea
                          placeholder="Type your answer…"
                          {...field}
                          disabled={submitting}
                          rows={3}
                          maxLength={ENRICHMENT_ANSWER_MAX_CHARS}
                          className="resize-y max-h-96"
                          aria-describedby={`q${i}-count`}
                        />
                        <p
                          id={`q${i}-count`}
                          className={`text-right text-[10px] tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {length} / {ENRICHMENT_ANSWER_MAX_CHARS}
                        </p>
                      </Field>
                    );
                  }}
                />
              </CardContent>
            </Card>
          ))}

          {error && (
            <div className="space-y-2 border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {errorPhase === "submit" ? "Submitting answers failed" : "Generating questions failed"}
              </p>
              <p className="text-xs leading-5 text-destructive/90">{error}</p>
              <Button variant="outline" size="sm" type="button" onClick={handleRetry}>
                {errorPhase === "submit" ? "Retry submission" : "Retry generation"}
              </Button>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1"
              type="submit"
              disabled={submitting || !hasAnswers}
            >
              {submitting ? "Analyzing answers…" : "Submit Answers"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              type="button"
              onClick={onSkip}
              disabled={submitting}
            >
              Skip
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
