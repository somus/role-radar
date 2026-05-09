import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { electrobun } from "./electrobun";
import { TagInput, type Tag } from "emblor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import type { CityResult } from "../shared/types";

const EXPERIENCE_LEVELS = [
  { value: "1", label: "Internship" },
  { value: "2", label: "Entry level" },
  { value: "3", label: "Associate" },
  { value: "4", label: "Mid-Senior" },
  { value: "5", label: "Director" },
  { value: "6", label: "Executive" },
];

const JOB_TYPES = [
  { value: "F", label: "Full-time" },
  { value: "P", label: "Part-time" },
  { value: "C", label: "Contract" },
  { value: "T", label: "Temporary" },
  { value: "I", label: "Internship" },
];

const searchFormSchema = z.object({
  keywords: z.array(z.string()).min(1, "At least one keyword required"),
  locationText: z.string(),
  geoId: z.string(),
  experienceLevel: z.string(),
  remote: z.boolean(),
  jobTypes: z.array(z.string()),
});

type SearchFormValues = z.infer<typeof searchFormSchema>;

function toTags(arr: string[]): Tag[] {
  return arr.map((text) => ({ id: crypto.randomUUID(), text }));
}

function fromTags(tags: Tag[]): string[] {
  return tags.map((t) => t.text);
}

type Props = {
  profileId: number;
  autoStartSearch?: boolean;
  onAutoStartConsumed?: () => void;
  onSearchComplete: () => void;
};

export function JobSearch({ profileId, autoStartSearch, onAutoStartConsumed, onSearchComplete }: Props) {
  const [searching, setSearching] = useState(false);
  const [autoSearching, setAutoSearching] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ total: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeKeywordIdx, setActiveKeywordIdx] = useState<number | null>(null);
  const [hasStoredQueries, setHasStoredQueries] = useState(false);
  const autoStartedRef = useRef(false);

  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      keywords: [],
      locationText: "",
      geoId: "",
      experienceLevel: "",
      remote: false,
      jobTypes: [],
    },
  });

  const jobTypes = watch("jobTypes");

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
        onSearchComplete();
      } else if (type === "job:search:error") {
        setSearching(false);
        setSearchError((payload as { message: string }).message);
      } else if (type === "queries:generating") {
        setAutoSearching(true);
        setAutoStatus("Generating queries from profile...");
        setSearchError(null);
        setResult(null);
      } else if (type === "queries:generated") {
        const { count } = payload as { count: number };
        setAutoStatus(`Generated ${count} queries, searching...`);
      } else if (type === "queries:progress") {
        const { current, total, query, strategy } = payload as { current: number; total: number; query: string; strategy: string };
        setAutoStatus(`Searching ${current}/${total}: [${strategy}] ${query}`);
      } else if (type === "queries:search:complete") {
        const { queriesRun, jobsDiscovered } = payload as { queriesRun: number; jobsDiscovered: number };
        setAutoSearching(false);
        setAutoStatus(null);
        setHasStoredQueries(queriesRun > 0);
        setResult({ total: jobsDiscovered });
        onSearchComplete();
      } else if (type === "queries:error") {
        setAutoSearching(false);
        setAutoStatus(null);
        setSearchError((payload as { message: string }).message);
      }
    }

    window.addEventListener("pipeline-update", handlePipeline);
    return () => window.removeEventListener("pipeline-update", handlePipeline);
  }, [onSearchComplete]);

  useEffect(() => {
    if (!autoStartSearch || autoStartedRef.current) return;
    autoStartedRef.current = true;
    setSearchError(null);
    setResult(null);
    setAutoSearching(true);
    onAutoStartConsumed?.();
    electrobun.rpc.send.generateAndSearch({ profileId });
  }, [autoStartSearch, onAutoStartConsumed, profileId]);

  function onSubmit(data: SearchFormValues) {
    setSearchError(null);
    setResult(null);
    electrobun.rpc.send.searchJobs({
      keywords: data.keywords,
      location: data.locationText.trim() || undefined,
      geoId: data.geoId || undefined,
      experienceLevel: data.experienceLevel || undefined,
      remote: data.remote,
      jobTypes: data.jobTypes.length > 0 ? data.jobTypes : undefined,
    });
  }

  function toggleJobType(value: string) {
    const current = jobTypes;
    if (current.includes(value)) {
      setValue("jobTypes", current.filter(v => v !== value));
    } else {
      setValue("jobTypes", [...current, value]);
    }
  }

  function handleCitySelect(city: CityResult) {
    setValue("locationText", `${city.name}, ${city.country}`);
    setValue("geoId", city.id);
  }

  function handleLocationClear() {
    setValue("geoId", "");
  }

  const [manualOpen, setManualOpen] = useState(false);
  const isBusy = searching || autoSearching;

  function startGeneratedSearch(kind: "generate" | "refresh" | "regenerate") {
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
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Job Search</CardTitle>
          {autoStatus && (
            <p className="text-xs text-muted-foreground animate-pulse">{autoStatus}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          size="lg"
          className="w-full"
          disabled={isBusy}
          onClick={() => startGeneratedSearch("generate")}
        >
          {autoSearching ? "Finding jobs..." : "Find jobs from profile"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy || !hasStoredQueries}
            onClick={() => startGeneratedSearch("refresh")}
          >
            Search saved queries
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => startGeneratedSearch("regenerate")}
          >
            Create new queries
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Search saved queries reuses existing generated queries without calling Gemini. Create new queries asks Gemini for a fresh search plan.
        </p>
        {!hasStoredQueries && (
          <p className="text-xs text-muted-foreground">Saved-query search unlocks after your first profile-based search.</p>
        )}

        {searchError && <p className="text-xs text-destructive">{searchError}</p>}
        {result && result.total === 0 && (
          <p className="text-xs text-muted-foreground">No new jobs found.</p>
        )}
        {result && result.total > 0 && (
          <Badge variant="secondary" className="text-xs">
            {result.total} new {result.total === 1 ? "job" : "jobs"} found
          </Badge>
        )}

        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="w-full text-muted-foreground">
              {manualOpen ? "Hide manual search" : "Manual search"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator className="my-3" />
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="keywords"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel className="text-xs">Keywords</FieldLabel>
                      <TagInput
                        tags={toTags(field.value)}
                        setTags={(newTags) => {
                          const tags = typeof newTags === "function" ? newTags(toTags(field.value)) : newTags;
                          field.onChange(fromTags(tags));
                        }}
                        activeTagIndex={activeKeywordIdx}
                        setActiveTagIndex={setActiveKeywordIdx}
                        placeholder="e.g., backend engineer"
                        styleClasses={{ input: "shadow-none", inlineTagsContainer: "border-input" }}
                        inlineTags
                      />
                      {fieldState.invalid && <FieldError>{fieldState.error?.message}</FieldError>}
                    </Field>
                  )}
                />

                <Field>
                  <FieldLabel className="text-xs">Location</FieldLabel>
                  <CityAutocomplete
                    value={watch("locationText")}
                    onChange={(text) => { setValue("locationText", text); handleLocationClear(); }}
                    onSelect={handleCitySelect}
                  />
                </Field>
              </div>

              <div className="flex items-end gap-3">
                <Field className="flex-1">
                  <FieldLabel className="text-xs">Experience Level</FieldLabel>
                  <Controller
                    name="experienceLevel"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v === "any" ? "" : v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          {EXPERIENCE_LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <div className="flex items-center gap-2 pb-1">
                  <Controller
                    name="remote"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="remote"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                  <FieldLabel htmlFor="remote" className="text-xs">Remote</FieldLabel>
                </div>

                <Button type="submit" disabled={isBusy} size="sm">
                  {searching ? "Searching..." : "Search"}
                </Button>
              </div>

              <div>
                <FieldLabel className="text-xs mb-1.5">Job Type</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_TYPES.map((jt) => (
                    <Badge
                      key={jt.value}
                      variant={jobTypes.includes(jt.value) ? "default" : "outline"}
                      className="cursor-pointer select-none text-xs"
                      onClick={() => toggleJobType(jt.value)}
                    >
                      {jt.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </form>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function CityAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect: (city: CityResult) => void;
}) {
  const [suggestions, setSuggestions] = useState<CityResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const fetchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const results = await electrobun.rpc.request.searchCities({ query });
      setSuggestions(results);
      setOpen(results.length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  function handleChange(text: string) {
    onChange(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCities(text), 300);
  }

  function handleSelect(city: CityResult) {
    onSelect(city);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="e.g., San Francisco"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-none border border-input bg-popover/90 backdrop-blur-xl shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((city) => (
            <button
              key={city.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-foreground/10 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(city)}
            >
              <span className="font-medium">{city.name}</span>
              {city.country && (
                <span className="text-muted-foreground ml-1">{city.country}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
