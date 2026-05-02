import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { electrobun } from "./electrobun";
import { TagInput, type Tag } from "emblor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import type { Profile } from "../shared/types";

const SENIORITY_LEVELS = ["Junior", "Mid", "Senior", "Staff", "Principal", "Executive"] as const;

const profileFormSchema = z.object({
  roles: z.array(z.string()).min(1, "At least one role required"),
  skills_primary: z.array(z.string()).min(1, "At least one primary skill required"),
  skills_secondary: z.array(z.string()),
  experience_years: z.number().int().nonnegative(),
  seniority: z.string().min(1),
  domains: z.array(z.string()),
  locations: z.array(z.string()),
  remote: z.boolean(),
  country: z.string().nullable(),
  min_salary: z.number().nonnegative().nullable(),
  company_sizes: z.array(z.string()),
  resumeText: z.string().min(1, "Resume text cannot be empty"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function toTags(arr: string[] | undefined): Tag[] {
  return (arr ?? []).map((text) => ({ id: crypto.randomUUID(), text }));
}
function fromTags(tags: Tag[]): string[] {
  return tags.map((t) => t.text);
}

type Props = {
  profile: Profile;
  resumeText: string;
  onSave: (profile: Profile) => void;
  onCancel?: () => void;
};

export function ProfileReview({ profile, resumeText, onSave, onCancel }: Props) {
  const prefs = profile.preferences ?? {};

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
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
      resumeText,
    },
  });

  const [rawTextOpen, setRawTextOpen] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(data: ProfileFormValues) {
    setSubmitError(null);
    try {
      const updatePromise = electrobun.rpc.request.updateProfile({
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
        resumeText: data.resumeText,
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Save timed out. Please try again.")), 30_000)
      );
      const updated = await Promise.race([updatePromise, timeout]);
      onSave(updated);
    } catch (e: any) {
      setSubmitError(e.message ?? "Failed to save profile");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto py-12 px-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Review Your Profile</h1>
          <p className="text-sm text-muted-foreground">
            Verify and edit the information extracted from your resume.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FieldGroup className="gap-6">
            <TagField name="roles" label="Target Roles" placeholder="Add role..." form={form} />
            <TagField name="skills_primary" label="Primary Skills" placeholder="Add skill..." form={form} />
            <TagField name="skills_secondary" label="Secondary Skills" placeholder="Add skill..." form={form} />

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

            <TagField name="domains" label="Domains" placeholder="Add domain..." form={form} />
          </FieldGroup>

          <div className="border-t pt-6 space-y-6">
            <h2 className="text-lg font-semibold">Preferences</h2>

            <FieldGroup className="gap-6">
              <TagField name="locations" label="Locations" placeholder="Add location..." form={form} />

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

              <TagField name="company_sizes" label="Preferred Company Sizes" placeholder="e.g. Startup, Mid-size..." form={form} />
            </FieldGroup>
          </div>

          <Collapsible open={rawTextOpen} onOpenChange={setRawTextOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" type="button" className="text-muted-foreground">
                {rawTextOpen ? "Hide" : "Show"} extracted resume text
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Controller
                name="resumeText"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="mt-3">
                    <FieldLabel className="text-xs text-muted-foreground">
                      Edit below to fix OCR or extraction errors
                    </FieldLabel>
                    <textarea
                      className="w-full min-h-64 p-4 text-xs font-mono bg-muted text-foreground rounded-lg border border-input resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </CollapsibleContent>
          </Collapsible>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex gap-3">
            <Button size="lg" className="flex-1" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save Profile"}
            </Button>
            {onCancel && (
              <Button size="lg" variant="ghost" type="button" onClick={onCancel} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function TagField({
  name,
  label,
  placeholder,
  form,
}: {
  name: keyof ProfileFormValues;
  label: string;
  placeholder: string;
  form: ReturnType<typeof useForm<ProfileFormValues>>;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>{label}</FieldLabel>
          <TagInput
            tags={toTags(field.value as string[])}
            setTags={(newTags) => {
              const tags = typeof newTags === "function" ? newTags(toTags(field.value as string[])) : newTags;
              field.onChange(fromTags(tags));
            }}
            activeTagIndex={activeIdx}
            setActiveTagIndex={setActiveIdx}
            placeholder={placeholder}
            styleClasses={{ input: "shadow-none", inlineTagsContainer: "border-input" }}
            inlineTags
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
