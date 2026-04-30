import type { ParsedJob, SelectorConfig } from "../shared/types";

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
