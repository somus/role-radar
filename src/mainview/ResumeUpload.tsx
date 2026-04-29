import { useState, useEffect, useRef } from "react";
import { electrobun } from "./electrobun";
import { Button } from "@/components/ui/button";
import type { PipelineEvent, Profile } from "../shared/types";

type Step = "idle" | "picking" | "resume:extracting" | "resume:parsing" | "resume:storing" | "error";

const KNOWN_STEPS = new Set<PipelineEvent["type"]>([
  "resume:extracting", "resume:parsing", "resume:storing",
  "resume:complete", "resume:error", "resume:cancelled",
]);

const stepLabels: Record<string, string> = {
  picking: "Opening file...",
  "resume:extracting": "Extracting text from PDF...",
  "resume:parsing": "Analyzing resume with AI...",
  "resume:storing": "Saving profile...",
};

type Props = {
  onComplete: (profile: Profile, resumeText: string) => void;
};

export function ResumeUpload({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
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
        setTimeout(() => retryRef.current?.focus(), 100);
      } else if (type === "resume:cancelled") {
        setStep("idle");
      } else {
        setStep(type);
      }
    };
    window.addEventListener("pipeline-update", handler);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pipeline-update", handler);
    };
  }, []);

  function handleUpload() {
    setStep("picking");
    setError(null);
    electrobun.rpc.send.pickAndProcessResume({});
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Upload Your Resume</h1>
          <p className="text-muted-foreground">
            Upload a PDF resume to extract your professional profile.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Works best with text-based PDFs. Scanned resumes use OCR (slower).
          </p>
        </div>

        {step === "idle" || step === "error" ? (
          <Button size="lg" onClick={handleUpload}>
            Choose PDF
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">
                {stepLabels[step] ?? step}
              </p>
            </div>
            <div className="flex gap-1 justify-center">
              {(["resume:extracting", "resume:parsing", "resume:storing"] as const).map((s) => {
                const steps = ["resume:extracting", "resume:parsing", "resume:storing"];
                const currentIdx = steps.indexOf(step);
                const thisIdx = steps.indexOf(s);
                return (
                  <div
                    key={s}
                    className={`h-1.5 w-12 rounded-full transition-colors ${
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
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button ref={retryRef} variant="outline" size="sm" onClick={handleUpload}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
