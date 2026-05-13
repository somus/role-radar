import { useEffect, useRef, useState } from "react";
import { electrobun } from "./electrobun";
import type { JobReasoning } from "../shared/types";

export type UseJobReasoningResult = {
  reasoningOpen: boolean;
  setReasoningOpen: (open: boolean) => void;
  reasoning: JobReasoning | null;
  reasoningLoading: boolean;
  reasoningError: string | null;
};

export function useJobReasoning(selectedJobId: number | null): UseJobReasoningResult {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [reasoningLoading, setReasoningLoading] = useState(false);
  const [reasoningError, setReasoningError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<JobReasoning | null>(null);
  const reasoningLoadedFor = useRef<number | null>(null);

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

  return {
    reasoningOpen,
    setReasoningOpen,
    reasoning,
    reasoningLoading,
    reasoningError,
  };
}
