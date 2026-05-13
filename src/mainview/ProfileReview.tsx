import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { electrobun } from "./electrobun";
import { OnboardingProgress } from "./OnboardingProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import type { Profile, StructuredResume } from "../shared/types";
import { profileFormSchema, type ProfileFormValues, TagField } from "./profile-form-shared";
import { StructuredResumeEditor } from "./StructuredResumeEditor";

const SENIORITY_LEVELS = ["Junior", "Mid", "Senior", "Staff", "Principal", "Executive"] as const;

const EMPTY_RESUME_JSON: StructuredResume = {
  contact: {
    name: "",
    email: "",
    phone: "",
    location: "",
    github: "",
    linkedin: "",
    personal_site: "",
    links: [],
  },
  summary: "",
  experience: [],
  skills: [],
  education: [],
  projects: [],
  certifications: [],
  extracurriculars: [],
  additional_sections: [],
  section_order: ["contact", "summary", "experience", "skills", "education"],
};

type Props = {
  profile: Profile;
  onSave: (profile: Profile) => void;
  onCancel?: () => void;
};

export function ProfileReview({ profile, onSave, onCancel }: Props) {
  const prefs = profile.preferences ?? {};

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema) as any,
    defaultValues: {
      roles: profile.roles ?? [],
      skills_primary: profile.skills_primary ?? [],
      skills_secondary: profile.skills_secondary ?? [],
      experience_years: profile.experience_years ?? 0,
      seniority: profile.seniority ?? "",
      domains: profile.domains ?? [],
      locations: prefs.locations ?? [],
      remote: prefs.remote ?? false,
      country: prefs.country ?? null,
      min_salary: prefs.min_salary ?? null,
      company_sizes: prefs.company_sizes ?? [],
      resumeJson: profile.resume_json ?? EMPTY_RESUME_JSON,
    },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [stillSaving, setStillSaving] = useState(false);
  const stillSavingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(stillSavingTimer.current);
    };
  }, []);

  async function onSubmit(data: ProfileFormValues) {
    setSubmitError(null);
    setStillSaving(false);
    clearTimeout(stillSavingTimer.current);
    stillSavingTimer.current = setTimeout(() => setStillSaving(true), 20_000);
    try {
      const updated = await electrobun.rpc.request.updateProfile({
        fields: {
          roles: data.roles,
          skills_primary: data.skills_primary,
          skills_secondary: data.skills_secondary,
          experience_years: data.experience_years,
          seniority: data.seniority,
          domains: data.domains,
          preferences: {
            locations: data.locations,
            remote: data.remote,
            country: data.country,
            min_salary: data.min_salary,
            company_sizes: data.company_sizes,
          },
        },
        resumeJson: data.resumeJson,
      });
      setSavedAt(Date.now());
      onSave(updated);
    } catch (e: any) {
      setSubmitError(e.message ?? "Failed to save profile");
    } finally {
      clearTimeout(stillSavingTimer.current);
      setStillSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto py-10 px-6 space-y-8">
        <OnboardingProgress current="profile" />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Scoring profile</p>
            <h1 className="text-2xl font-semibold tracking-tight">Confirm the inputs that rank your feed</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep this focused on how you want roles discovered and scored. Detailed resume content is available below as an advanced source editor.
            </p>
          </div>
          <aside className="border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
            Saving changes clears stale scores and re-runs scoring against the updated profile.
          </aside>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <section className="space-y-6 border border-border bg-card p-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Ranked feed inputs</h2>
              <p className="text-xs text-muted-foreground">These fields drive search generation, fit scoring, and reranking.</p>
            </div>

            <FieldGroup className="gap-6">
              <TagField name="roles" label="Target Roles" placeholder="Add role…" form={form} />
              <TagField name="skills_primary" label="Primary Skills" placeholder="Add skill…" form={form} />
              <TagField name="skills_secondary" label="Secondary Skills" placeholder="Add skill…" form={form} />

              <div className="grid grid-cols-2 gap-4">
                <Controller
                  name="experience_years"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="experience_years">Experience (years)</FieldLabel>
                      <Input
                        id="experience_years"
                        type="number"
                        min={0}
                        step={1}
                        value={field.value}
                        onChange={(e) => field.onChange(Math.floor(Number(e.target.value) || 0))}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                <Controller
                  name="seniority"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="seniority">Seniority</FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="seniority" aria-invalid={fieldState.invalid}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SENIORITY_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>{level}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>

              <TagField name="domains" label="Domains" placeholder="Add domain…" form={form} />
            </FieldGroup>
          </section>

          <section className="space-y-6 border border-border bg-card p-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Preferences and constraints</h2>
              <p className="text-xs text-muted-foreground">Use enrichment after this step to add richer career intent and dealbreakers.</p>
            </div>

            {profile.dealbreakers.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Current dealbreakers</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.dealbreakers.map((dealbreaker) => (
                    <Badge key={dealbreaker} variant="destructive">{dealbreaker}</Badge>
                  ))}
                </div>
              </div>
            )}

            <FieldGroup className="gap-6">
              <TagField name="locations" label="Locations" placeholder="Add location…" form={form} />

              <Controller
                name="remote"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="remote">Open to Remote</FieldLabel>
                    <Switch
                      id="remote"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <Controller
                name="country"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="country">Country (for remote job search)</FieldLabel>
                    <Input
                      id="country"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      placeholder="e.g., India, United States"
                    />
                  </Field>
                )}
              />

              <Controller
                name="min_salary"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="min_salary">Minimum Salary (optional)</FieldLabel>
                    <Input
                      id="min_salary"
                      type="number"
                      min={0}
                      placeholder="e.g. 150000"
                      value={field.value?.toString() ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v ? Number(v) : null);
                      }}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <TagField name="company_sizes" label="Preferred Company Sizes" placeholder="e.g. Startup, Mid-size…" form={form} />
            </FieldGroup>
          </section>

          <Collapsible>
            <section className="border border-border bg-card">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="flex h-auto w-full justify-between rounded-none px-5 py-4 text-left">
                  <span>
                    <span className="block text-base font-semibold">Resume Source</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Advanced editor for the structured resume used by future tailored PDFs.
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">Show fields</span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border px-5 pb-5">
                <StructuredResumeEditor form={form} />
              </CollapsibleContent>
            </section>
          </Collapsible>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="flex-1" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {form.formState.isSubmitting ? "Saving…" : "Save and rescore jobs"}
            </Button>
            {onCancel && (
              <Button size="lg" variant="ghost" type="button" onClick={onCancel} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {form.formState.isSubmitting
              ? stillSaving
                ? "Still saving — large profiles can take a moment…"
                : "Saving…"
              : savedAt
                ? `Saved ${formatRelative(savedAt)}`
                : ""}
          </p>
        </form>
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleString();
}
