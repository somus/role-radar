import { useState } from "react";
import { useForm, Controller, type FieldPath, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { electrobun } from "./electrobun";
import { TagInput, type Tag } from "emblor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type { Profile, StructuredResume } from "../shared/types";
import { StructuredResumeSchema } from "../shared/types";

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
  resumeJson: StructuredResumeSchema,
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type ProfileForm = UseFormReturn<ProfileFormValues>;
type ProfileFieldPath = FieldPath<ProfileFormValues>;

function toTags(arr: string[] | undefined): Tag[] {
  return (arr ?? []).map((text) => ({ id: crypto.randomUUID(), text }));
}
function fromTags(tags: Tag[]): string[] {
  return tags.map((t) => t.text);
}

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
        resumeJson: data.resumeJson,
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
      <div className="max-w-4xl mx-auto py-12 px-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Review Your Profile</h1>
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

          <StructuredResumeEditor form={form} />

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex gap-3">
            <Button size="lg" className="flex-1" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save and rescore jobs"}
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

function TextField({
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

function TextAreaField({
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

function rowKey(prefix: string, index: number, ...parts: string[]) {
  void parts;
  return `${prefix}-${index}`;
}

function StructuredResumeEditor({
  form,
}: {
  form: ProfileForm;
}) {
  const resume = form.watch("resumeJson");

  function commitResume(next: StructuredResume | ((current: StructuredResume) => StructuredResume)) {
    const current = form.getValues("resumeJson");
    const resolved = typeof next === "function" ? next(current) : next;
    form.setValue("resumeJson", resolved, { shouldDirty: true, shouldValidate: true });
  }

  function addExperience() {
    commitResume((current) => ({
      ...current,
      experience: [
        ...current.experience,
        { company: "", title: "", location: "", start_date: "", end_date: "", current: false, bullets: [""] },
      ],
    }));
  }

  function removeExperience(index: number) {
    commitResume((current) => ({ ...current, experience: current.experience.filter((_, i) => i !== index) }));
  }

  function addExperienceBullet(index: number) {
    commitResume((current) => ({
      ...current,
      experience: current.experience.map((item, i) =>
        i === index ? { ...item, bullets: [...item.bullets, ""] } : item
      ),
    }));
  }

  function removeExperienceBullet(index: number, bulletIndex: number) {
    commitResume((current) => ({
      ...current,
      experience: current.experience.map((item, i) =>
        i === index ? { ...item, bullets: item.bullets.filter((_, b) => b !== bulletIndex) } : item
      ),
    }));
  }

  function addSkillGroup() {
    commitResume((current) => ({ ...current, skills: [...current.skills, { category: "", items: [] }] }));
  }

  function removeSkillGroup(index: number) {
    commitResume((current) => ({ ...current, skills: current.skills.filter((_, i) => i !== index) }));
  }

  function addEducation() {
    commitResume((current) => ({
      ...current,
      education: [
        ...current.education,
        { institution: "", degree: "", field: "", gpa: "", location: "", start_date: "", end_date: "", details: [] },
      ],
    }));
  }

  function removeEducation(index: number) {
    commitResume((current) => ({ ...current, education: current.education.filter((_, i) => i !== index) }));
  }

  function addProject() {
    commitResume((current) => ({
      ...current,
      projects: [
        ...current.projects,
        { name: "", role: "", url: "", start_date: "", end_date: "", bullets: [""], technologies: [] },
      ],
    }));
  }

  function removeProject(index: number) {
    commitResume((current) => ({ ...current, projects: current.projects.filter((_, i) => i !== index) }));
  }

  function addProjectBullet(index: number) {
    commitResume((current) => ({
      ...current,
      projects: current.projects.map((item, i) =>
        i === index ? { ...item, bullets: [...item.bullets, ""] } : item
      ),
    }));
  }

  function removeProjectBullet(index: number, bulletIndex: number) {
    commitResume((current) => ({
      ...current,
      projects: current.projects.map((item, i) =>
        i === index ? { ...item, bullets: item.bullets.filter((_, b) => b !== bulletIndex) } : item
      ),
    }));
  }

  function addCertification() {
    commitResume((current) => ({
      ...current,
      certifications: [...current.certifications, { name: "", issuer: "", date: "", url: "" }],
    }));
  }

  function removeCertification(index: number) {
    commitResume((current) => ({
      ...current,
      certifications: current.certifications.filter((_, i) => i !== index),
    }));
  }

  function addExtracurricular() {
    commitResume((current) => ({
      ...current,
      extracurriculars: [
        ...current.extracurriculars,
        { activity: "", start_date: "", end_date: "", bullets: [""] },
      ],
    }));
  }

  function removeExtracurricular(index: number) {
    commitResume((current) => ({
      ...current,
      extracurriculars: current.extracurriculars.filter((_, i) => i !== index),
    }));
  }

  function addExtracurricularBullet(index: number) {
    commitResume((current) => ({
      ...current,
      extracurriculars: current.extracurriculars.map((item, i) =>
        i === index ? { ...item, bullets: [...item.bullets, ""] } : item
      ),
    }));
  }

  function removeExtracurricularBullet(index: number, bulletIndex: number) {
    commitResume((current) => ({
      ...current,
      extracurriculars: current.extracurriculars.map((item, i) =>
        i === index ? { ...item, bullets: item.bullets.filter((_, b) => b !== bulletIndex) } : item
      ),
    }));
  }

  function addAdditionalSection() {
    commitResume((current) => ({
      ...current,
      additional_sections: [...current.additional_sections, { title: "", items: [] }],
    }));
  }

  function removeAdditionalSection(index: number) {
    commitResume((current) => ({
      ...current,
      additional_sections: current.additional_sections.filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="border-t pt-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Resume Fields</h2>
        <p className="text-xs text-muted-foreground">
          Correct the structured resume content used for future tailored PDFs.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField name="resumeJson.contact.name" label="Name" form={form} />
          <TextField name="resumeJson.contact.email" label="Email" form={form} />
          <TextField name="resumeJson.contact.phone" label="Phone" form={form} />
          <TextField name="resumeJson.contact.location" label="Location" form={form} />
          <TextField name="resumeJson.contact.github" label="GitHub" form={form} />
          <TextField name="resumeJson.contact.linkedin" label="LinkedIn" form={form} />
          <TextField name="resumeJson.contact.personal_site" label="Personal Site" form={form} />
        </div>
        {resume.contact.links.map((link, index) => (
          <div key={rowKey("link", index, link.label, link.url)} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <TextField name={`resumeJson.contact.links.${index}.label`} label="Link Label" form={form} />
            <TextField name={`resumeJson.contact.links.${index}.url`} label="URL" form={form} />
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                commitResume((current) => ({
                  ...current,
                  contact: {
                    ...current.contact,
                    links: current.contact.links.filter((_, i) => i !== index),
                  },
                }));
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            commitResume((current) => ({
              ...current,
              contact: {
                ...current.contact,
                links: [...current.contact.links, { label: "", url: "" }],
              },
            }));
          }}
        >
          Add Link
        </Button>
      </div>

      <TextAreaField
        name="resumeJson.summary"
        label="Summary"
        form={form}
        placeholder="Professional summary from the resume"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Experience</h3>
          <Button type="button" variant="outline" onClick={addExperience}>Add Experience</Button>
        </div>
        {resume.experience.map((item, index) => (
          <div key={rowKey("experience", index, item.company, item.title, item.start_date)} className="border border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                {item.title || item.company || `Experience ${index + 1}`}
              </p>
              <Button type="button" variant="ghost" onClick={() => removeExperience(index)}>Remove</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField name={`resumeJson.experience.${index}.company`} label="Company" form={form} />
              <TextField name={`resumeJson.experience.${index}.title`} label="Title" form={form} />
              <TextField name={`resumeJson.experience.${index}.location`} label="Location" form={form} />
              <TextField name={`resumeJson.experience.${index}.start_date`} label="Start Date" form={form} />
              <TextField name={`resumeJson.experience.${index}.end_date`} label="End Date" form={form} />
              <Controller
                name={`resumeJson.experience.${index}.current` as ProfileFieldPath}
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldLabel>Current Role</FieldLabel>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </Field>
                )}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>Bullets</FieldLabel>
                <Button type="button" variant="outline" onClick={() => addExperienceBullet(index)}>Add Bullet</Button>
              </div>
              {item.bullets.map((bullet, bulletIndex) => (
                <div key={rowKey("experience-bullet", bulletIndex, bullet)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <TextAreaField
                    name={`resumeJson.experience.${index}.bullets.${bulletIndex}`}
                    label={`Bullet ${bulletIndex + 1}`}
                    form={form}
                    minHeight="min-h-16"
                  />
                  <Button type="button" variant="ghost" onClick={() => removeExperienceBullet(index, bulletIndex)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Skills</h3>
          <Button type="button" variant="outline" onClick={addSkillGroup}>Add Skill Group</Button>
        </div>
        {resume.skills.map((group, index) => (
          <div key={rowKey("skills", index, group.category, group.items.join(","))} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <TextField name={`resumeJson.skills.${index}.category`} label="Category" form={form} />
            <TagField
              name={`resumeJson.skills.${index}.items` as ProfileFieldPath}
              label="Skills"
              placeholder="Add skill..."
              form={form}
            />
            <Button type="button" variant="ghost" onClick={() => removeSkillGroup(index)}>Remove</Button>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Education</h3>
          <Button type="button" variant="outline" onClick={addEducation}>Add Education</Button>
        </div>
        {resume.education.map((education, index) => (
          <div key={rowKey("education", index, education.institution, education.degree)} className="border border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">Education {index + 1}</p>
              <Button type="button" variant="ghost" onClick={() => removeEducation(index)}>Remove</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField name={`resumeJson.education.${index}.institution`} label="Institution" form={form} />
              <TextField name={`resumeJson.education.${index}.degree`} label="Degree" form={form} />
              <TextField name={`resumeJson.education.${index}.field`} label="Field" form={form} />
              <TextField name={`resumeJson.education.${index}.gpa`} label="GPA" form={form} />
              <TextField name={`resumeJson.education.${index}.location`} label="Location" form={form} />
              <TextField name={`resumeJson.education.${index}.start_date`} label="Start Date" form={form} />
              <TextField name={`resumeJson.education.${index}.end_date`} label="End Date" form={form} />
            </div>
            <TagField
              name={`resumeJson.education.${index}.details` as ProfileFieldPath}
              label="Details"
              placeholder="Add detail..."
              form={form}
            />
          </div>
        ))}
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="text-muted-foreground">
            Show optional sections
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-6">
          <OptionalProjects
            form={form}
            resume={resume}
            addProject={addProject}
            removeProject={removeProject}
            addProjectBullet={addProjectBullet}
            removeProjectBullet={removeProjectBullet}
          />
          <OptionalCertifications
            form={form}
            resume={resume}
            addCertification={addCertification}
            removeCertification={removeCertification}
          />
          <OptionalExtracurriculars
            form={form}
            resume={resume}
            addExtracurricular={addExtracurricular}
            removeExtracurricular={removeExtracurricular}
            addExtracurricularBullet={addExtracurricularBullet}
            removeExtracurricularBullet={removeExtracurricularBullet}
          />
          <AdditionalSections
            form={form}
            resume={resume}
            addAdditionalSection={addAdditionalSection}
            removeAdditionalSection={removeAdditionalSection}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function OptionalProjects({
  form,
  resume,
  addProject,
  removeProject,
  addProjectBullet,
  removeProjectBullet,
}: {
  form: ProfileForm;
  resume: StructuredResume;
  addProject: () => void;
  removeProject: (index: number) => void;
  addProjectBullet: (index: number) => void;
  removeProjectBullet: (index: number, bulletIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Projects</h3>
        <Button type="button" variant="outline" onClick={addProject}>Add Project</Button>
      </div>
      {resume.projects.map((project, index) => (
        <div key={rowKey("project", index, project.name, project.role)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Project {index + 1}</p>
            <Button type="button" variant="ghost" onClick={() => removeProject(index)}>Remove</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField name={`resumeJson.projects.${index}.name`} label="Name" form={form} />
            <TextField name={`resumeJson.projects.${index}.role`} label="Role" form={form} />
            <TextField name={`resumeJson.projects.${index}.url`} label="URL" form={form} />
            <TextField name={`resumeJson.projects.${index}.start_date`} label="Start Date" form={form} />
            <TextField name={`resumeJson.projects.${index}.end_date`} label="End Date" form={form} />
          </div>
          <TagField
            name={`resumeJson.projects.${index}.technologies` as ProfileFieldPath}
            label="Technologies"
            placeholder="Add technology..."
            form={form}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Bullets</FieldLabel>
              <Button type="button" variant="outline" onClick={() => addProjectBullet(index)}>
                Add Bullet
              </Button>
            </div>
          {resume.projects[index]?.bullets.map((bullet, bulletIndex) => (
            <div key={rowKey("project-bullet", bulletIndex, bullet)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <TextAreaField
                name={`resumeJson.projects.${index}.bullets.${bulletIndex}` as ProfileFieldPath}
                label={`Bullet ${bulletIndex + 1}`}
                form={form}
                minHeight="min-h-16"
              />
              <Button type="button" variant="ghost" onClick={() => removeProjectBullet(index, bulletIndex)}>
                Remove
              </Button>
            </div>
          ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OptionalCertifications({
  form,
  resume,
  addCertification,
  removeCertification,
}: {
  form: ProfileForm;
  resume: StructuredResume;
  addCertification: () => void;
  removeCertification: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Certifications</h3>
        <Button type="button" variant="outline" onClick={addCertification}>Add Certification</Button>
      </div>
      {resume.certifications.map((certification, index) => (
        <div key={rowKey("certification", index, certification.name, certification.issuer)} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <TextField name={`resumeJson.certifications.${index}.name`} label="Name" form={form} />
          <TextField name={`resumeJson.certifications.${index}.issuer`} label="Issuer" form={form} />
          <TextField name={`resumeJson.certifications.${index}.date`} label="Date" form={form} />
          <TextField name={`resumeJson.certifications.${index}.url`} label="URL" form={form} />
          <Button type="button" variant="ghost" onClick={() => removeCertification(index)}>Remove</Button>
        </div>
      ))}
    </div>
  );
}

function OptionalExtracurriculars({
  form,
  resume,
  addExtracurricular,
  removeExtracurricular,
  addExtracurricularBullet,
  removeExtracurricularBullet,
}: {
  form: ProfileForm;
  resume: StructuredResume;
  addExtracurricular: () => void;
  removeExtracurricular: (index: number) => void;
  addExtracurricularBullet: (index: number) => void;
  removeExtracurricularBullet: (index: number, bulletIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Extracurriculars</h3>
        <Button type="button" variant="outline" onClick={addExtracurricular}>Add Extracurricular</Button>
      </div>
      {resume.extracurriculars.map((item, index) => (
        <div key={rowKey("extracurricular", index, item.activity)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {item.activity || `Extracurricular ${index + 1}`}
            </p>
            <Button type="button" variant="ghost" onClick={() => removeExtracurricular(index)}>Remove</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField name={`resumeJson.extracurriculars.${index}.activity`} label="Activity" form={form} />
            <TextField name={`resumeJson.extracurriculars.${index}.start_date`} label="Start Date" form={form} />
            <TextField name={`resumeJson.extracurriculars.${index}.end_date`} label="End Date" form={form} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Bullets</FieldLabel>
              <Button type="button" variant="outline" onClick={() => addExtracurricularBullet(index)}>
                Add Bullet
              </Button>
            </div>
            {item.bullets.map((bullet, bulletIndex) => (
              <div key={rowKey("extracurricular-bullet", bulletIndex, bullet)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <TextAreaField
                  name={`resumeJson.extracurriculars.${index}.bullets.${bulletIndex}`}
                  label={`Bullet ${bulletIndex + 1}`}
                  form={form}
                  minHeight="min-h-16"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeExtracurricularBullet(index, bulletIndex)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdditionalSections({
  form,
  resume,
  addAdditionalSection,
  removeAdditionalSection,
}: {
  form: ProfileForm;
  resume: StructuredResume;
  addAdditionalSection: () => void;
  removeAdditionalSection: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Additional Sections</h3>
        <Button type="button" variant="outline" onClick={addAdditionalSection}>Add Section</Button>
      </div>
      {resume.additional_sections.map((section, index) => (
        <div key={rowKey("additional-section", index, section.title)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {section.title || `Section ${index + 1}`}
            </p>
            <Button type="button" variant="ghost" onClick={() => removeAdditionalSection(index)}>Remove</Button>
          </div>
          <TextField name={`resumeJson.additional_sections.${index}.title` as ProfileFieldPath} label="Title" form={form} />
          <TagField
            name={`resumeJson.additional_sections.${index}.items` as ProfileFieldPath}
            label="Items"
            placeholder="Add item..."
            form={form}
          />
        </div>
      ))}
    </div>
  );
}
