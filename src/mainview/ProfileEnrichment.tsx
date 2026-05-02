import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import type { Profile, EnrichmentQuestion, EnrichmentAnswer } from "../shared/types";

type Props = {
  profile: Profile;
  forceRegenerate?: boolean;
  onComplete: (profile: Profile) => void;
  onSkip: () => void;
};

const pendingGenerations = new Set<number>();

const CATEGORY_LABELS: Record<string, string> = {
  career_intent: "Career Intent",
  problem_solving: "Problem Solving",
  technical_depth: "Technical Depth",
};

type FormValues = Record<string, string>;

export function ProfileEnrichment({ profile, forceRegenerate, onComplete, onSkip }: Props) {
  const [questions, setQuestions] = useState<EnrichmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPhase, setErrorPhase] = useState<"generate" | "submit" | null>(null);
  const questionsRef = useRef<EnrichmentQuestion[]>([]);
  const form = useForm<FormValues>({ defaultValues: {} });
  const watchedValues = form.watch();
  const hasAnswers = Object.values(watchedValues).some((v) => v.trim().length > 0);

  useEffect(() => {
    let cancelled = false;

    function handlePipelineEvent(e: Event) {
      if (cancelled) return;
      const { type, payload } = (e as CustomEvent).detail;

      if (type === "enrichment:questions") {
        const qs = payload.questions as EnrichmentQuestion[];
        setQuestions(qs);
        questionsRef.current = qs;
        const defaults: FormValues = {};
        qs.forEach((_, i) => { defaults[`q${i}`] = ""; });
        form.reset(defaults);

        electrobun.rpc.request.getEnrichmentAnswers({ profileId: profile.id }).then((saved) => {
          if (cancelled || saved.length === 0) return;
          const prefilled: FormValues = {};
          for (let i = 0; i < qs.length; i++) {
            const match = saved.find((s) => s.question === qs[i]!.question);
            prefilled[`q${i}`] = match?.answer ?? "";
          }
          form.reset(prefilled);
        }).catch((e) => { console.error("[enrichment] Failed to load saved answers:", e); });
        setLoading(false);
        pendingGenerations.delete(profile.id);
      } else if (type === "enrichment:complete") {
        pendingGenerations.delete(profile.id);
        onComplete(payload.profile);
      } else if (type === "enrichment:error") {
        setError(payload.message);
        setLoading(false);
        setSubmitting(false);
        setErrorPhase(questionsRef.current.length > 0 ? "submit" : "generate");
      }
    }

    window.addEventListener("pipeline-update", handlePipelineEvent);

    async function init() {
      if (pendingGenerations.has(profile.id)) return;
      pendingGenerations.add(profile.id);
      try {
        if (!forceRegenerate) {
          const existing = await electrobun.rpc.request.getEnrichmentAnswers({ profileId: profile.id });
          if (existing.length > 0 && !cancelled) {
            pendingGenerations.delete(profile.id);
            onSkip();
            return;
          }
        }
        electrobun.rpc.send.generateEnrichmentQuestions({ profileId: profile.id });
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message ?? "Failed to start question generation");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      window.removeEventListener("pipeline-update", handlePipelineEvent);
    };
  }, [profile.id]);

  function handleRetry() {
    setError(null);
    setErrorPhase(null);
    pendingGenerations.delete(profile.id);
    if (questions.length === 0) {
      setLoading(true);
      pendingGenerations.add(profile.id);
      electrobun.rpc.send.generateEnrichmentQuestions({ profileId: profile.id });
    } else {
      form.handleSubmit(onSubmit)();
    }
  }

  function onSubmit(data: FormValues) {
    setSubmitting(true);
    setError(null);

    const enrichmentAnswers: EnrichmentAnswer[] = questions
      .map((q, i) => ({
        question: q.question,
        answer: (data[`q${i}`] ?? "").trim(),
        category: q.category,
      }))
      .filter((a) => a.answer.length > 0);

    electrobun.rpc.send.processEnrichmentAnswers({
      profileId: profile.id,
      answers: enrichmentAnswers,
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground animate-pulse">Generating questions from your profile...</p>
          <p className="text-xs text-muted-foreground">This may take a moment with local models.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto py-12 px-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Enrichment Questions</h1>
          <p className="text-sm text-muted-foreground">
            Answer these questions to improve job matching accuracy. All questions are optional.
          </p>
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
                  render={({ field }) => (
                    <Field>
                      <FieldLabel className="text-xs text-muted-foreground">{q.guided_prompt}</FieldLabel>
                      <Textarea
                        placeholder="Type your answer..."
                        {...field}
                        disabled={submitting}
                        rows={3}
                        className="resize-y"
                      />
                    </Field>
                  )}
                />
              </CardContent>
            </Card>
          ))}

          {error && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" type="button" onClick={handleRetry}>
                Retry
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
              {submitting ? "Analyzing answers..." : "Submit Answers"}
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
