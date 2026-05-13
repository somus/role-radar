import { useCallback, useEffect, useRef, useState } from "react";
import { electrobun } from "./electrobun";

export type AutoSearchKind = "generate" | "refresh" | "regenerate";

export type AutoSearchState = {
  searching: boolean;
  autoSearching: boolean;
  autoStatus: string | null;
  result: { total: number } | null;
  searchError: string | null;
  hasStoredQueries: boolean;
};

export type UseAutoSearchResult = AutoSearchState & {
  startGeneratedSearch: (kind: AutoSearchKind) => void;
  beginManualSearch: () => void;
};

export function useAutoSearch(profileId: number, onSearchComplete: () => void): UseAutoSearchResult {
  const [searching, setSearching] = useState(false);
  const [autoSearching, setAutoSearching] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ total: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasStoredQueries, setHasStoredQueries] = useState(false);

  const onSearchCompleteRef = useRef(onSearchComplete);
  onSearchCompleteRef.current = onSearchComplete;
  const progressUpdateRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(progressUpdateRef.current);
  }, []);

  useEffect(() => {
    function handlePipeline(e: Event) {
      const { type, payload } = (e as CustomEvent).detail;
      if (type === "job:searching") {
        setSearching(true);
        setResult(null);
        setSearchError(null);
      } else if (type === "job:search:complete") {
        setSearching(false);
        setResult((prev) => ({ total: (prev?.total ?? 0) + (payload as { total: number }).total }));
        onSearchCompleteRef.current();
      } else if (type === "job:search:error") {
        setSearching(false);
        setSearchError((payload as { message: string }).message);
      } else if (type === "queries:generating") {
        setAutoSearching(true);
        setAutoStatus("Generating queries from profile…");
        setSearchError(null);
        setResult(null);
      } else if (type === "queries:generated") {
        const { count } = payload as { count: number };
        setAutoStatus(`Generated ${count} queries, searching…`);
      } else if (type === "queries:progress") {
        const { current, total, query, strategy } = payload as { current: number; total: number; query: string; strategy: string };
        // Coalesce rapid progress events so we render at most every 250ms.
        clearTimeout(progressUpdateRef.current);
        progressUpdateRef.current = setTimeout(() => {
          setAutoStatus(`Searching ${current}/${total}: [${strategy}] ${query}`);
        }, 250);
      } else if (type === "queries:search:complete") {
        const { queriesRun, jobsDiscovered } = payload as { queriesRun: number; jobsDiscovered: number };
        clearTimeout(progressUpdateRef.current);
        setAutoSearching(false);
        setAutoStatus(null);
        setHasStoredQueries(queriesRun > 0);
        setResult({ total: jobsDiscovered });
        onSearchCompleteRef.current();
      } else if (type === "queries:error") {
        clearTimeout(progressUpdateRef.current);
        setAutoSearching(false);
        setAutoStatus(null);
        setSearchError((payload as { message: string }).message);
      }
    }

    window.addEventListener("pipeline-update", handlePipeline);
    return () => window.removeEventListener("pipeline-update", handlePipeline);
  }, []);

  const startGeneratedSearch = useCallback((kind: AutoSearchKind) => {
    setSearchError(null);
    setResult(null);
    setAutoSearching(true);
    if (kind === "refresh") {
      electrobun.rpc.send.refreshSearch({ profileId });
    } else if (kind === "regenerate") {
      electrobun.rpc.send.regenerateQueries({ profileId });
    } else {
      electrobun.rpc.send.generateAndSearch({ profileId });
    }
  }, [profileId]);

  const beginManualSearch = useCallback(() => {
    setSearchError(null);
    setResult(null);
  }, []);

  return {
    searching,
    autoSearching,
    autoStatus,
    result,
    searchError,
    hasStoredQueries,
    startGeneratedSearch,
    beginManualSearch,
  };
}
