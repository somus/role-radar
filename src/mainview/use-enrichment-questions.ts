import { useCallback, useEffect, useRef, useState } from "react";
import { electrobun } from "./electrobun";
import type { EnrichmentQuestion, Profile } from "../shared/types";

type ErrorPhase = "generate" | "submit" | null;

type EnrichmentEventHandlers = {
  onQuestions: (questions: EnrichmentQuestion[]) => void;
  onComplete: (profile: Profile) => void;
};

export type UseEnrichmentQuestionsResult = {
  questions: EnrichmentQuestion[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  errorPhase: ErrorPhase;
  setSubmitting: (value: boolean) => void;
  beginSubmit: () => void;
  retry: (kind: "generate" | "submit") => void;
};

const pendingGenerations = new Set<number>();

export function useEnrichmentQuestions(
  profile: Profile,
  forceRegenerate: boolean | undefined,
  handlers: EnrichmentEventHandlers,
  onAlreadyHasAnswers: () => void,
): UseEnrichmentQuestionsResult {
  const [questions, setQuestions] = useState<EnrichmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPhase, setErrorPhase] = useState<ErrorPhase>(null);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const onAlreadyHasAnswersRef = useRef(onAlreadyHasAnswers);
  onAlreadyHasAnswersRef.current = onAlreadyHasAnswers;
  const questionsRef = useRef<EnrichmentQuestion[]>([]);

  useEffect(() => {
    let cancelled = false;

    function handlePipelineEvent(e: Event) {
      if (cancelled) return;
      const { type, payload } = (e as CustomEvent).detail;

      if (type === "enrichment:questions") {
        const qs = payload.questions as EnrichmentQuestion[];
        questionsRef.current = qs;
        setQuestions(qs);
        setLoading(false);
        pendingGenerations.delete(profile.id);
        handlersRef.current.onQuestions(qs);
      } else if (type === "enrichment:complete") {
        pendingGenerations.delete(profile.id);
        handlersRef.current.onComplete(payload.profile);
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
            onAlreadyHasAnswersRef.current();
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

    void init();

    return () => {
      cancelled = true;
      pendingGenerations.delete(profile.id);
      window.removeEventListener("pipeline-update", handlePipelineEvent);
    };
  }, [profile.id, forceRegenerate]);

  const beginSubmit = useCallback(() => {
    setSubmitting(true);
    setError(null);
  }, []);

  const retry = useCallback((kind: "generate" | "submit") => {
    setError(null);
    setErrorPhase(null);
    if (kind === "generate") {
      pendingGenerations.delete(profile.id);
      setLoading(true);
      pendingGenerations.add(profile.id);
      electrobun.rpc.send.generateEnrichmentQuestions({ profileId: profile.id });
    }
    // submit retry handled by caller (it owns the form values)
  }, [profile.id]);

  return {
    questions,
    loading,
    submitting,
    error,
    errorPhase,
    setSubmitting,
    beginSubmit,
    retry,
  };
}
