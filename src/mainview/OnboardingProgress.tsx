import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { buildOnboardingSteps, type OnboardingStepKey } from "./onboarding-flow";
import { cn } from "@/lib/utils";

export function OnboardingProgress({ current }: { current: OnboardingStepKey }) {
  const steps = buildOnboardingSteps(current);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [current]);

  return (
    <nav aria-label="Setup progress" className="-mx-2 overflow-x-auto sm:overflow-visible">
      <ol className="flex min-w-max gap-2 px-2 sm:grid sm:min-w-0 sm:grid-cols-5 sm:gap-2">
        {steps.map((step, index) => (
          <li
            key={step.key}
            ref={step.state === "current" ? currentRef : undefined}
            aria-current={step.state === "current" ? "step" : undefined}
            title={step.label}
            className={cn(
              "w-44 shrink-0 snap-start border border-border bg-card px-3 py-2 sm:w-auto",
              step.state === "current" && "border-primary bg-primary/5",
              step.state === "complete" && "bg-muted/50",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center border border-border text-[10px] tabular-nums text-muted-foreground",
                  step.state === "current" && "border-primary text-primary",
                  step.state === "complete" && "border-primary/30 bg-primary/10 text-primary",
                )}
                aria-hidden="true"
              >
                {step.state === "complete" ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate text-xs font-medium">{step.label}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground" title={step.description}>{step.description}</p>
          </li>
        ))}
      </ol>
    </nav>
  );
}

