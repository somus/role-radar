import type { JobSourceId, SelectorConfig } from "../../shared/types";
import { JOB_SOURCE_IDS } from "../../shared/types";
import { createLinkedInSource } from "./linkedin";
import type { JobSource } from "./job-source";

export type RegistryOptions = {
  linkedInSelectors: SelectorConfig;
};

export type SourceRegistry = {
  get(id: JobSourceId): JobSource | undefined;
  all(): JobSource[];
  enabledIds(filter?: (id: JobSourceId) => boolean): JobSourceId[];
};

export function createSourceRegistry(opts: RegistryOptions): SourceRegistry {
  const sources = new Map<JobSourceId, JobSource>();

  sources.set("linkedin", createLinkedInSource({
    selectors: opts.linkedInSelectors,
    maxAgeSecs: (opts.linkedInSelectors.maxAgeDays ?? 7) * 86400,
    pagesPerQuery: opts.linkedInSelectors.pagesPerQuery,
  }));

  return {
    get(id) {
      return sources.get(id);
    },
    all() {
      return Array.from(sources.values());
    },
    enabledIds(filter) {
      return JOB_SOURCE_IDS.filter((id) => {
        const src = sources.get(id);
        if (!src) return false;
        if (filter && !filter(id)) return false;
        return src.capabilities.enabledByDefault;
      });
    },
  };
}
