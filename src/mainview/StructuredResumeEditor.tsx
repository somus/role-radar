import { useCallback } from "react";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { StructuredResume } from "../shared/types";
import {
  TagField,
  TextField,
  TextAreaField,
  rowKey,
  type ProfileForm,
  type ProfileFieldPath,
} from "./profile-form-shared";

type ResumeAction =
  | { type: "addContactLink" }
  | { type: "removeContactLink"; index: number }
  | { type: "addExperience" }
  | { type: "removeExperience"; index: number }
  | { type: "addExperienceBullet"; index: number }
  | { type: "removeExperienceBullet"; index: number; bulletIndex: number }
  | { type: "addSkillGroup" }
  | { type: "removeSkillGroup"; index: number }
  | { type: "addEducation" }
  | { type: "removeEducation"; index: number }
  | { type: "addProject" }
  | { type: "removeProject"; index: number }
  | { type: "addProjectBullet"; index: number }
  | { type: "removeProjectBullet"; index: number; bulletIndex: number }
  | { type: "addCertification" }
  | { type: "removeCertification"; index: number }
  | { type: "addExtracurricular" }
  | { type: "removeExtracurricular"; index: number }
  | { type: "addExtracurricularBullet"; index: number }
  | { type: "removeExtracurricularBullet"; index: number; bulletIndex: number }
  | { type: "addAdditionalSection" }
  | { type: "removeAdditionalSection"; index: number };

function resumeReducer(state: StructuredResume, action: ResumeAction): StructuredResume {
  switch (action.type) {
    case "addContactLink":
      return { ...state, contact: { ...state.contact, links: [...state.contact.links, { label: "", url: "" }] } };
    case "removeContactLink":
      return { ...state, contact: { ...state.contact, links: state.contact.links.filter((_, i) => i !== action.index) } };
    case "addExperience":
      return {
        ...state,
        experience: [
          ...state.experience,
          { company: "", title: "", location: "", start_date: "", end_date: "", current: false, bullets: [""] },
        ],
      };
    case "removeExperience":
      return { ...state, experience: state.experience.filter((_, i) => i !== action.index) };
    case "addExperienceBullet":
      return {
        ...state,
        experience: state.experience.map((item, i) =>
          i === action.index ? { ...item, bullets: [...item.bullets, ""] } : item,
        ),
      };
    case "removeExperienceBullet":
      return {
        ...state,
        experience: state.experience.map((item, i) =>
          i === action.index
            ? { ...item, bullets: item.bullets.filter((_, b) => b !== action.bulletIndex) }
            : item,
        ),
      };
    case "addSkillGroup":
      return { ...state, skills: [...state.skills, { category: "", items: [] }] };
    case "removeSkillGroup":
      return { ...state, skills: state.skills.filter((_, i) => i !== action.index) };
    case "addEducation":
      return {
        ...state,
        education: [
          ...state.education,
          { institution: "", degree: "", field: "", gpa: "", location: "", start_date: "", end_date: "", details: [] },
        ],
      };
    case "removeEducation":
      return { ...state, education: state.education.filter((_, i) => i !== action.index) };
    case "addProject":
      return {
        ...state,
        projects: [
          ...state.projects,
          { name: "", role: "", url: "", start_date: "", end_date: "", bullets: [""], technologies: [] },
        ],
      };
    case "removeProject":
      return { ...state, projects: state.projects.filter((_, i) => i !== action.index) };
    case "addProjectBullet":
      return {
        ...state,
        projects: state.projects.map((item, i) =>
          i === action.index ? { ...item, bullets: [...item.bullets, ""] } : item,
        ),
      };
    case "removeProjectBullet":
      return {
        ...state,
        projects: state.projects.map((item, i) =>
          i === action.index
            ? { ...item, bullets: item.bullets.filter((_, b) => b !== action.bulletIndex) }
            : item,
        ),
      };
    case "addCertification":
      return {
        ...state,
        certifications: [...state.certifications, { name: "", issuer: "", date: "", url: "" }],
      };
    case "removeCertification":
      return {
        ...state,
        certifications: state.certifications.filter((_, i) => i !== action.index),
      };
    case "addExtracurricular":
      return {
        ...state,
        extracurriculars: [
          ...state.extracurriculars,
          { activity: "", start_date: "", end_date: "", bullets: [""] },
        ],
      };
    case "removeExtracurricular":
      return {
        ...state,
        extracurriculars: state.extracurriculars.filter((_, i) => i !== action.index),
      };
    case "addExtracurricularBullet":
      return {
        ...state,
        extracurriculars: state.extracurriculars.map((item, i) =>
          i === action.index ? { ...item, bullets: [...item.bullets, ""] } : item,
        ),
      };
    case "removeExtracurricularBullet":
      return {
        ...state,
        extracurriculars: state.extracurriculars.map((item, i) =>
          i === action.index
            ? { ...item, bullets: item.bullets.filter((_, b) => b !== action.bulletIndex) }
            : item,
        ),
      };
    case "addAdditionalSection":
      return {
        ...state,
        additional_sections: [...state.additional_sections, { title: "", items: [] }],
      };
    case "removeAdditionalSection":
      return {
        ...state,
        additional_sections: state.additional_sections.filter((_, i) => i !== action.index),
      };
  }
}

function useResumeEditor(form: ProfileForm) {
  return useCallback(
    (action: ResumeAction) => {
      const current = form.getValues("resumeJson");
      const next = resumeReducer(current, action);
      form.setValue("resumeJson", next, { shouldDirty: true, shouldValidate: true });
    },
    [form],
  );
}

export function StructuredResumeEditor({ form }: { form: ProfileForm }) {
  const resume = form.watch("resumeJson");
  const dispatch = useResumeEditor(form);

  return (
    <div className="border-t pt-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Resume Fields</h2>
        <p className="text-xs text-muted-foreground">
          Correct the structured resume content used for future tailored PDFs.
        </p>
      </div>

      <ContactSection resume={resume} form={form} dispatch={dispatch} />

      <TextAreaField
        name="resumeJson.summary"
        label="Summary"
        form={form}
        placeholder="Professional summary from the resume"
      />

      <ExperienceSection resume={resume} form={form} dispatch={dispatch} />
      <SkillsSection resume={resume} form={form} dispatch={dispatch} />
      <EducationSection resume={resume} form={form} dispatch={dispatch} />

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button" className="text-muted-foreground">
            Show optional sections
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-6">
          <OptionalProjects resume={resume} form={form} dispatch={dispatch} />
          <OptionalCertifications resume={resume} form={form} dispatch={dispatch} />
          <OptionalExtracurriculars resume={resume} form={form} dispatch={dispatch} />
          <AdditionalSections resume={resume} form={form} dispatch={dispatch} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type SectionProps = {
  resume: StructuredResume;
  form: ProfileForm;
  dispatch: (action: ResumeAction) => void;
};

function ContactSection({ resume, form, dispatch }: SectionProps) {
  return (
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
        <div key={rowKey("link", index)} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <TextField name={`resumeJson.contact.links.${index}.label`} label="Link Label" form={form} />
          <TextField name={`resumeJson.contact.links.${index}.url`} label="URL" form={form} />
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeContactLink", index })}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => dispatch({ type: "addContactLink" })}>
        Add Link
      </Button>
    </div>
  );
}

function ExperienceSection({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Experience</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addExperience" })}>
          Add Experience
        </Button>
      </div>
      {resume.experience.map((item, index) => (
        <div key={rowKey("experience", index)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {item.title || item.company || `Experience ${index + 1}`}
            </p>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeExperience", index })}>
              Remove
            </Button>
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
              <Button type="button" variant="outline" onClick={() => dispatch({ type: "addExperienceBullet", index })}>
                Add Bullet
              </Button>
            </div>
            {item.bullets.map((bullet, bulletIndex) => (
              <div key={rowKey("experience-bullet", bulletIndex)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <TextAreaField
                  name={`resumeJson.experience.${index}.bullets.${bulletIndex}`}
                  label={`Bullet ${bulletIndex + 1}`}
                  form={form}
                  minHeight="min-h-16"
                />
                <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeExperienceBullet", index, bulletIndex })}>
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

function SkillsSection({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Skills</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addSkillGroup" })}>
          Add Skill Group
        </Button>
      </div>
      {resume.skills.map((group, index) => (
        <div key={rowKey("skills", index)} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <TextField name={`resumeJson.skills.${index}.category`} label="Category" form={form} />
          <TagField
            name={`resumeJson.skills.${index}.items` as ProfileFieldPath}
            label="Skills"
            placeholder="Add skill…"
            form={form}
          />
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeSkillGroup", index })}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function EducationSection({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Education</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addEducation" })}>
          Add Education
        </Button>
      </div>
      {resume.education.map((education, index) => (
        <div key={rowKey("education", index)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Education {index + 1}</p>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeEducation", index })}>
              Remove
            </Button>
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
            placeholder="Add detail…"
            form={form}
          />
        </div>
      ))}
    </div>
  );
}

function OptionalProjects({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Projects</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addProject" })}>
          Add Project
        </Button>
      </div>
      {resume.projects.map((project, index) => (
        <div key={rowKey("project", index)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Project {index + 1}</p>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeProject", index })}>
              Remove
            </Button>
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
            placeholder="Add technology…"
            form={form}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Bullets</FieldLabel>
              <Button type="button" variant="outline" onClick={() => dispatch({ type: "addProjectBullet", index })}>
                Add Bullet
              </Button>
            </div>
            {project.bullets.map((bullet, bulletIndex) => (
              <div key={rowKey("project-bullet", bulletIndex)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <TextAreaField
                  name={`resumeJson.projects.${index}.bullets.${bulletIndex}` as ProfileFieldPath}
                  label={`Bullet ${bulletIndex + 1}`}
                  form={form}
                  minHeight="min-h-16"
                />
                <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeProjectBullet", index, bulletIndex })}>
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

function OptionalCertifications({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Certifications</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addCertification" })}>
          Add Certification
        </Button>
      </div>
      {resume.certifications.map((certification, index) => (
        <div key={rowKey("certification", index)} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <TextField name={`resumeJson.certifications.${index}.name`} label="Name" form={form} />
          <TextField name={`resumeJson.certifications.${index}.issuer`} label="Issuer" form={form} />
          <TextField name={`resumeJson.certifications.${index}.date`} label="Date" form={form} />
          <TextField name={`resumeJson.certifications.${index}.url`} label="URL" form={form} />
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeCertification", index })}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function OptionalExtracurriculars({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Extracurriculars</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addExtracurricular" })}>
          Add Extracurricular
        </Button>
      </div>
      {resume.extracurriculars.map((item, index) => (
        <div key={rowKey("extracurricular", index)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {item.activity || `Extracurricular ${index + 1}`}
            </p>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeExtracurricular", index })}>
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField name={`resumeJson.extracurriculars.${index}.activity`} label="Activity" form={form} />
            <TextField name={`resumeJson.extracurriculars.${index}.start_date`} label="Start Date" form={form} />
            <TextField name={`resumeJson.extracurriculars.${index}.end_date`} label="End Date" form={form} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Bullets</FieldLabel>
              <Button type="button" variant="outline" onClick={() => dispatch({ type: "addExtracurricularBullet", index })}>
                Add Bullet
              </Button>
            </div>
            {item.bullets.map((bullet, bulletIndex) => (
              <div key={rowKey("extracurricular-bullet", bulletIndex)} className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <TextAreaField
                  name={`resumeJson.extracurriculars.${index}.bullets.${bulletIndex}`}
                  label={`Bullet ${bulletIndex + 1}`}
                  form={form}
                  minHeight="min-h-16"
                />
                <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeExtracurricularBullet", index, bulletIndex })}>
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

function AdditionalSections({ resume, form, dispatch }: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Additional Sections</h3>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "addAdditionalSection" })}>
          Add Section
        </Button>
      </div>
      {resume.additional_sections.map((section, index) => (
        <div key={rowKey("additional-section", index)} className="border border-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {section.title || `Section ${index + 1}`}
            </p>
            <Button type="button" variant="ghost" onClick={() => dispatch({ type: "removeAdditionalSection", index })}>
              Remove
            </Button>
          </div>
          <TextField name={`resumeJson.additional_sections.${index}.title` as ProfileFieldPath} label="Title" form={form} />
          <TagField
            name={`resumeJson.additional_sections.${index}.items` as ProfileFieldPath}
            label="Items"
            placeholder="Add item…"
            form={form}
          />
        </div>
      ))}
    </div>
  );
}
