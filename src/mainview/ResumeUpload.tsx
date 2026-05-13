import { useState, useEffect, useRef } from "react";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import { OnboardingProgress } from "./OnboardingProgress";
import type { PipelineEvent, Profile } from "../shared/types";

const STEP_ORDER = ["resume:extracting", "resume:parsing", "resume:storing"] as const;
type ProgressStep = (typeof STEP_ORDER)[number];
type Step = "idle" | "picking" | ProgressStep | "error";

const KNOWN_STEPS = new Set<PipelineEvent["type"]>([
  ...STEP_ORDER,
  "resume:complete", "resume:error", "resume:cancelled",
]);

const stepLabels: Record<ProgressStep | "picking", string> = {
  picking: "Opening file…",
  "resume:extracting": "Extracting text from PDF…",
  "resume:parsing": "Analyzing resume with AI…",
  "resume:storing": "Saving profile…",
};

function isProgressStep(step: Step): step is ProgressStep {
  return (STEP_ORDER as readonly string[]).includes(step);
}

type Props = {
  onComplete: (profile: Profile, resumeText: string) => void;
};

export function ResumeUpload({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const handler = async (e: Event) => {
      const { type, payload } = (e as CustomEvent).detail;
      if (!mountedRef.current) return;

      if (!KNOWN_STEPS.has(type)) {
        console.warn(`[ResumeUpload] Unknown pipeline event: ${type}`);
        return;
      }

      if (type === "resume:complete") {
        try {
          const profile = await electrobun.rpc.request.getProfile();
          const text = await electrobun.rpc.request.getResumeText();
          if (profile && mountedRef.current) onCompleteRef.current(profile, text ?? "");
        } catch (err: any) {
          if (!mountedRef.current) return;
          setStep("error");
          setError(err.message ?? "Failed to load profile");
        }
      } else if (type === "resume:error") {
        setStep("error");
        setError(payload.message);
        clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(() => {
          if (mountedRef.current) retryRef.current?.focus();
        }, 100);
      } else if (type === "resume:cancelled") {
        setStep("idle");
      } else {
        setStep(type);
      }
    };
    window.addEventListener("pipeline-update", handler);
    return () => {
      mountedRef.current = false;
      clearTimeout(focusTimer.current);
      window.removeEventListener("pipeline-update", handler);
    };
  }, []);

  function handleUpload() {
    setStep("picking");
    setError(null);
    electrobun.rpc.send.pickAndProcessResume({});
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-10">
        <OnboardingProgress current="resume" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Resume intake</p>
              <h1 className="text-3xl font-semibold tracking-tight">Build your first scoring profile</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Upload a PDF resume. Role Radar extracts the profile used for search, scoring, and later tailored resume generation.
              </p>
            </div>

            {step === "idle" || step === "error" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={handleUpload}>
                  Choose PDF
                </Button>
                <p className="text-xs text-muted-foreground">
                  Text-based PDFs are fastest. Scanned resumes use OCR and can take longer.
                </p>
              </div>
            ) : (
              <div className="space-y-4 border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {step === "picking" ? stepLabels.picking : isProgressStep(step) ? stepLabels[step] : step}
                    </p>
                    <p className="text-xs text-muted-foreground">Keep this window open while parsing finishes.</p>
                  </div>
                  <div className="size-4 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="grid grid-cols-3 gap-1" role="progressbar" aria-label="Resume processing">
                  {STEP_ORDER.map((s) => {
                    const currentIdx = isProgressStep(step) ? STEP_ORDER.indexOf(step) : -1;
                    const thisIdx = STEP_ORDER.indexOf(s);
                    return (
                      <div
                        key={s}
                        className={`h-1.5 rounded-full transition-colors ${
                          step === s
                            ? "bg-primary"
                            : currentIdx > thisIdx
                              ? "bg-primary/40"
                              : "bg-muted"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="space-y-3 border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{error}</p>
                <Button ref={retryRef} variant="outline" size="sm" onClick={handleUpload}>
                  Retry upload
                </Button>
              </div>
            )}
          </div>

          <aside className="space-y-3 border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium">What happens next</p>
            <ol className="space-y-2 text-xs leading-5 text-muted-foreground">
              <li>1. Extract text and structured resume fields.</li>
              <li>2. Review the scoring profile before search starts.</li>
              <li>3. Add goals and dealbreakers for better ranking.</li>
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
