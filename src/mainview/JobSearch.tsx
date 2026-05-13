import { useState, useEffect, useRef, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { RefreshCw, Search, SlidersHorizontal, WandSparkles } from "lucide-react";
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
import { useAutoSearch } from "./use-auto-search";

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
  const {
    searching,
    autoSearching,
    autoStatus,
    result,
    searchError,
    hasStoredQueries,
    startGeneratedSearch,
    beginManualSearch,
  } = useAutoSearch(profileId, onSearchComplete);

  const [activeKeywordIdx, setActiveKeywordIdx] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const autoStartedRef = useRef(false);

  const { handleSubmit, control, setValue, watch } = useForm<SearchFormValues>({
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

  const onAutoStartConsumedRef = useRef(onAutoStartConsumed);
  onAutoStartConsumedRef.current = onAutoStartConsumed;
  const startGeneratedSearchRef = useRef(startGeneratedSearch);
  startGeneratedSearchRef.current = startGeneratedSearch;

  useEffect(() => {
    if (!autoStartSearch || autoStartedRef.current) return;
    autoStartedRef.current = true;
    onAutoStartConsumedRef.current?.();
    startGeneratedSearchRef.current("generate");
  }, [autoStartSearch]);

  function onSubmit(data: SearchFormValues) {
    beginManualSearch();
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

  const isBusy = searching || autoSearching;

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Discovery</CardTitle>
            {(searching || autoSearching) && <Badge variant="secondary" className="text-[10px]">Running</Badge>}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Start with generated LinkedIn searches, then use manual search only when you want to steer a specific query.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {autoStatus && (
          <div className="border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground animate-pulse">
            {autoStatus}
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={isBusy}
          onClick={() => startGeneratedSearch("generate")}
        >
          <WandSparkles className="size-4" />
          {autoSearching ? "Finding jobs…" : "Find jobs from profile"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy || !hasStoredQueries}
            onClick={() => startGeneratedSearch("refresh")}
          >
            <RefreshCw className="size-3.5" />
            Search saved queries
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => startGeneratedSearch("regenerate")}
          >
            <Search className="size-3.5" />
            Create new queries
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Search saved queries reuses existing generated queries without calling Gemini. Create new queries asks Gemini for a fresh search plan.
        </p>
        {!hasStoredQueries && (
          <p className="text-xs text-muted-foreground">Saved-query search unlocks after your first profile-based search.</p>
        )}

        {searchError && (
          <div className="space-y-2 border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-destructive">Search failed</p>
            <p className="text-[11px] leading-5 text-destructive/90">{searchError}</p>
            <Button variant="outline" size="xs" onClick={() => startGeneratedSearch("generate")}>
              Retry from profile
            </Button>
          </div>
        )}
        {result && result.total === 0 && (
          <div className="space-y-1 border border-dashed border-border bg-muted/20 p-3 text-center">
            <p className="text-xs font-medium">No new jobs found</p>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Generated queries can be narrow. Try Create new queries, or open Manual search to steer keywords and location.
            </p>
          </div>
        )}
        {result && result.total > 0 && (
          <Badge variant="secondary" className="text-xs">
            {result.total} new {result.total === 1 ? "job" : "jobs"} found
          </Badge>
        )}

        <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="w-full text-muted-foreground">
              <SlidersHorizontal className="size-3" />
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
                  {searching ? "Searching…" : "Search"}
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(blurTimer.current);
    };
  }, []);

  const fetchCities = useCallback(async (query: string) => {
    try {
      const results = await electrobun.rpc.request.searchCities({ query });
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIndex(results.length > 0 ? 0 : -1);
    } catch {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }, []);

  function handleChange(text: string) {
    onChange(text);
    clearTimeout(debounceRef.current);
    if (text.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    debounceRef.current = setTimeout(() => fetchCities(text), 300);
  }

  function handleSelect(city: CityResult) {
    onSelect(city);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
        setActiveIndex(0);
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => (idx - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault();
        handleSelect(suggestions[activeIndex]!);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const listboxId = "city-autocomplete-listbox";
  const activeOptionId = activeIndex >= 0 ? `city-option-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onBlur={() => {
          clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="e.g., San Francisco"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
      />
      {open && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-none border border-input bg-popover/90 backdrop-blur-xl shadow-md max-h-48 overflow-y-auto"
        >
          {suggestions.map((city, index) => {
            const active = index === activeIndex;
            return (
              <button
                id={`city-option-${index}`}
                key={city.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${active ? "bg-foreground/10" : "hover:bg-foreground/10"}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(city)}
              >
                <span className="font-medium">{city.name}</span>
                {city.country && (
                  <span className="text-muted-foreground ml-1">{city.country}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
