import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import type { JobSourceId, ParsedJob, PipelineEvent } from "../../shared/types";
import type { JobSource, JobSourceCapabilities, NormalizedQuery, SearchOptions, SearchResult } from "../sources/job-source";
import type { SourceRegistry } from "../sources/registry";
import { runSearchOrchestration } from "../search-orchestrator";
import { getSourceHealth, setSourceEnabled } from "../source-health-store";

const migrationSql = [
  readFileSync(join(import.meta.dir, "../../../migrations/001_init.sql"), "utf-8"),
  readFileSync(join(import.meta.dir, "../../../migrations/007_multi_source.sql"), "utf-8"),
].join("\n");

function freshDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrationSql);
  return db;
}

const defaultCaps: JobSourceCapabilities = {
  mode: "http",
  hasDetail: false,
  listHasDescription: true,
  postedAtQuality: "exact",
  pageSize: 10,
  rateLimit: { perMs: 0 },
  detailConcurrency: 1,
  enabledByDefault: true,
};

function makeFakeSource(
  id: JobSourceId,
  produce: (q: NormalizedQuery) => ParsedJob[] | Promise<ParsedJob[]>,
): JobSource {
  return {
    id,
    capabilities: defaultCaps,
    async search(query: NormalizedQuery, opts: SearchOptions): Promise<SearchResult> {
      const jobs = await produce(query);
      let inserted = 0;
      let failed = 0;
      if (opts.onBatch) {
        const r = opts.onBatch(jobs);
        inserted = r.inserted;
      } else {
        inserted = jobs.length;
      }
      failed = jobs.filter((j) => j.status === "parse_failed").length;
      return { jobs, inserted, failed };
    },
  };
}

function makeRegistry(sources: JobSource[]): SourceRegistry {
  const map = new Map(sources.map((s) => [s.id, s]));
  return {
    get: (id) => map.get(id),
    all: () => sources,
    enabledIds: () => sources.map((s) => s.id),
  };
}

function makeJob(source: JobSourceId, id: string, title = "Title"): ParsedJob {
  return {
    source,
    sourceId: id,
    title,
    company: "Co",
    location: "Bangalore",
    url: `https://${source}.example/${id}`,
    postedAt: "2026-05-12",
    postedText: "2026-05-12",
    postedAtConfidence: "exact",
    descriptionExcerptOnly: false,
    status: "discovered",
  };
}

const SAMPLE_QUERY: NormalizedQuery = {
  keywords: ["backend"],
  location: "Bangalore",
  experienceLevel: null,
  remote: false,
};

describe("runSearchOrchestration", () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  test("distributes inserts across sources and stops at maxJobs", async () => {
    const linkedin = makeFakeSource("linkedin", () =>
      Array.from({ length: 10 }, (_, i) => makeJob("linkedin", `li_${i}`)),
    );
    const shine = makeFakeSource("shine", () =>
      Array.from({ length: 10 }, (_, i) => makeJob("shine", `sh_${i}`)),
    );
    // Only linkedin + shine enabled
    for (const id of ["naukri", "indeed", "foundit", "timesjobs", "freshersworld", "internshala", "cutshort", "apna"] as JobSourceId[]) {
      setSourceEnabled(db, id, false);
    }

    const registry = makeRegistry([linkedin, shine]);

    const result = await runSearchOrchestration({
      db,
      registry,
      queries: [SAMPLE_QUERY],
      maxJobs: 15,
    });

    expect(result.totalInserted).toBe(15);
    expect((result.perSource.get("linkedin") ?? 0) + (result.perSource.get("shine") ?? 0)).toBe(15);
    expect(result.failedSources).toEqual([]);
  });

  test("source returning zero inserts increments consecutive_failures", async () => {
    const empty = makeFakeSource("apna", () => []);
    for (const id of ["linkedin", "naukri", "indeed", "foundit", "shine", "timesjobs", "freshersworld", "internshala", "cutshort"] as JobSourceId[]) {
      setSourceEnabled(db, id, false);
    }

    const registry = makeRegistry([empty]);
    const result = await runSearchOrchestration({
      db,
      registry,
      queries: [SAMPLE_QUERY],
      maxJobs: 10,
    });

    expect(result.totalInserted).toBe(0);
    expect(result.failedSources).toContain("apna");
    expect(getSourceHealth(db).get("apna")!.consecutive_failures).toBe(1);
  });

  test("source throwing error records failure but doesn't crash run", async () => {
    const linkedin = makeFakeSource("linkedin", () => [makeJob("linkedin", "li_1")]);
    const broken: JobSource = {
      id: "naukri",
      capabilities: defaultCaps,
      async search() {
        throw new Error("HTTP 500");
      },
    };
    for (const id of ["indeed", "foundit", "shine", "timesjobs", "freshersworld", "internshala", "cutshort", "apna"] as JobSourceId[]) {
      setSourceEnabled(db, id, false);
    }

    const registry = makeRegistry([linkedin, broken]);
    const events: PipelineEvent[] = [];
    const result = await runSearchOrchestration({
      db,
      registry,
      queries: [SAMPLE_QUERY],
      maxJobs: 10,
      emit: (e) => events.push(e),
    });

    expect(result.totalInserted).toBe(1);
    expect(result.failedSources).toContain("naukri");
    expect(getSourceHealth(db).get("naukri")!.last_error).toBe("HTTP 500");
    const errEvent = events.find((e) => e.type === "job:search:error");
    expect(errEvent).toBeDefined();
  });

  test("auto-quarantines after 3 consecutive zero-insert runs", async () => {
    const empty = makeFakeSource("cutshort", () => []);
    for (const id of ["linkedin", "naukri", "indeed", "foundit", "shine", "timesjobs", "freshersworld", "internshala", "apna"] as JobSourceId[]) {
      setSourceEnabled(db, id, false);
    }
    const registry = makeRegistry([empty]);

    for (let i = 0; i < 3; i++) {
      await runSearchOrchestration({ db, registry, queries: [SAMPLE_QUERY], maxJobs: 5 });
    }

    expect(getSourceHealth(db).get("cutshort")!.status).toBe("quarantined");
  });

  test("respects enabledSources override", async () => {
    const linkedin = makeFakeSource("linkedin", () => [makeJob("linkedin", "li_1")]);
    const shine = makeFakeSource("shine", () => [makeJob("shine", "sh_1")]);
    const registry = makeRegistry([linkedin, shine]);

    const result = await runSearchOrchestration({
      db,
      registry,
      queries: [SAMPLE_QUERY],
      maxJobs: 10,
      enabledSources: ["linkedin"],
    });

    expect(result.perSource.has("shine")).toBe(false);
    expect(result.perSource.get("linkedin")).toBe(1);
  });
});
