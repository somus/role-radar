export type OnboardingStepKey = "api" | "resume" | "profile" | "enrichment" | "search";

export type OnboardingStepState = "complete" | "current" | "upcoming";

export type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  description: string;
  state: OnboardingStepState;
};

const STEP_DEFINITIONS: Array<Omit<OnboardingStep, "state">> = [
  { key: "api", label: "Connect AI", description: "Validate Gemini access" },
  { key: "resume", label: "Upload Resume", description: "Extract profile data" },
  { key: "profile", label: "Check Profile", description: "Confirm scoring inputs" },
  { key: "enrichment", label: "Add Context", description: "Capture goals and dealbreakers" },
  { key: "search", label: "Find Roles", description: "Start ranked discovery" },
];

export function buildOnboardingSteps(current: OnboardingStepKey): OnboardingStep[] {
  const currentIndex = STEP_DEFINITIONS.findIndex((step) => step.key === current);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

  return STEP_DEFINITIONS.map((step, index) => ({
    ...step,
    state: index < safeCurrentIndex ? "complete" : index === safeCurrentIndex ? "current" : "upcoming",
  }));
}

