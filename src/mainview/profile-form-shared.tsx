import { useState } from "react";
import { Controller, type FieldPath, type UseFormReturn } from "react-hook-form";
import { z } from "zod/v4";
import { TagInput, type Tag } from "emblor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { StructuredResumeSchema } from "../shared/types";

export const profileFormSchema = z.object({
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
  resumeJson: StructuredResumeSchema,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
export type ProfileForm = UseFormReturn<ProfileFormValues>;
export type ProfileFieldPath = FieldPath<ProfileFormValues>;

function toTags(arr: string[] | undefined): Tag[] {
  return (arr ?? []).map((text) => ({ id: crypto.randomUUID(), text }));
}

function fromTags(tags: Tag[]): string[] {
  return tags.map((t) => t.text);
}

export function TagField({
  name,
  label,
  placeholder,
  form,
}: {
  name: ProfileFieldPath;
  label: string;
  placeholder: string;
  form: ProfileForm;
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

export function TextField({
  name,
  label,
  form,
  placeholder,
}: {
  name: ProfileFieldPath;
  label: string;
  form: ProfileForm;
  placeholder?: string;
}) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>{label}</FieldLabel>
          <Input
            value={typeof field.value === "string" || typeof field.value === "number" ? field.value : ""}
            onChange={field.onChange}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function TextAreaField({
  name,
  label,
  form,
  placeholder,
  minHeight = "min-h-24",
}: {
  name: ProfileFieldPath;
  label: string;
  form: ProfileForm;
  placeholder?: string;
  minHeight?: string;
}) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>{label}</FieldLabel>
          <Textarea
            className={minHeight}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={field.onChange}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function rowKey(prefix: string, index: number) {
  return `${prefix}-${index}`;
}
