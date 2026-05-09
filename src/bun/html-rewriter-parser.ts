import type { DetailSelectorConfig, ParsedJob, ParsedJobDetail, SelectorConfig } from "../shared/types";

export async function parseSearchResults(
  html: string,
  selectors: SelectorConfig
): Promise<ParsedJob[]> {
  const jobs: ParsedJob[] = [];
  let current: Partial<ParsedJob> | null = null;
  let activeField: "title" | "company" | "location" | null = null;

  const idRegex = new RegExp(selectors.idPattern);

  const rewriter = new HTMLRewriter()
    .on(selectors.jobCard, {
      element(el) {
        if (current) {
          jobs.push(finalize(current));
        }
        current = {
          sourceId: "",
          title: "",
          company: null,
          location: null,
          url: null,
          postedAt: null,
        };
        const urn = el.getAttribute(selectors.idAttribute);
        if (urn) {
          const match = urn.match(idRegex);
          if (match) current.sourceId = match[1];
        }
      },
    })
    .on(selectors.title, {
      element() {
        activeField = "title";
      },
      text(chunk) {
        if (!current || activeField !== "title") return;
        current.title = (current.title ?? "") + chunk.text;
        if (chunk.lastInTextNode) activeField = null;
      },
    })
    .on(selectors.company, {
      element() {
        activeField = "company";
      },
      text(chunk) {
        if (!current || activeField !== "company") return;
        current.company = (current.company ?? "") + chunk.text;
        if (chunk.lastInTextNode) activeField = null;
      },
    })
    .on(selectors.location, {
      element() {
        activeField = "location";
      },
      text(chunk) {
        if (!current || activeField !== "location") return;
        current.location = (current.location ?? "") + chunk.text;
        if (chunk.lastInTextNode) activeField = null;
      },
    })
    .on(selectors.url, {
      element(el) {
        if (!current) return;
        current.url = el.getAttribute("href");
      },
    })
    .on(selectors.postedTime, {
      element(el) {
        if (!current) return;
        current.postedAt = el.getAttribute("datetime");
      },
    });

  await rewriter.transform(new Response(html)).text();

  if (current) {
    jobs.push(finalize(current));
  }

  return jobs;
}

type CriterionAccum = { label: string; value: string };

export async function parseJobDetail(
  html: string,
  selectors: DetailSelectorConfig
): Promise<ParsedJobDetail> {
  let description = "";
  let inDescription = false;

  const criteria: CriterionAccum[] = [];
  let current: CriterionAccum | null = null;
  let activeField: "label" | "value" | null = null;

  const rewriter = new HTMLRewriter()
    .on(selectors.description, {
      element() {
        inDescription = true;
      },
      text(chunk) {
        if (!inDescription) return;
        description += chunk.text;
        if (chunk.lastInTextNode && description.length > 0) {
          // Description spans multiple text chunks; keep accumulating.
        }
      },
    })
    .on(selectors.criteriaList, {
      element() {
        if (current) criteria.push(current);
        current = { label: "", value: "" };
        activeField = null;
      },
    })
    .on(selectors.criteriaLabel, {
      element() {
        activeField = "label";
      },
      text(chunk) {
        if (!current || activeField !== "label") return;
        current.label += chunk.text;
        if (chunk.lastInTextNode) activeField = null;
      },
    })
    .on(selectors.criteriaValue, {
      element() {
        activeField = "value";
      },
      text(chunk) {
        if (!current || activeField !== "value") return;
        current.value += chunk.text;
        if (chunk.lastInTextNode) activeField = null;
      },
    });

  await rewriter.transform(new Response(html)).text();

  if (current) criteria.push(current);

  const map = new Map<string, string>();
  for (const c of criteria) {
    const key = c.label.trim().toLowerCase();
    const val = c.value.trim();
    if (key && val) map.set(key, val);
  }

  const cleanedDesc = description.replace(/\s+/g, " ").trim();

  return {
    description: cleanedDesc.length > 0 ? cleanedDesc : null,
    seniority: map.get("seniority level") ?? null,
    employmentType: map.get("employment type") ?? null,
    function: map.get("job function") ?? null,
    industry: map.get("industries") ?? map.get("industry") ?? null,
  };
}

function finalize(partial: Partial<ParsedJob>): ParsedJob {
  const title = partial.title?.trim() || "";
  const sourceId = partial.sourceId || "";
  const hasCriticalFields = title.length > 0 && sourceId.length > 0;

  return {
    sourceId,
    title,
    company: partial.company?.trim() || null,
    location: partial.location?.trim() || null,
    url: partial.url || null,
    postedAt: partial.postedAt || null,
    status: hasCriticalFields ? "discovered" : "parse_failed",
  };
}
