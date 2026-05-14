import type { Database } from "bun:sqlite";
import { JOB_SOURCE_IDS, type JobSourceId } from "../shared/types";

export type SourceHealthStatus = "ok" | "broken" | "quarantined" | "disabled";

export type SourceHealthRow = {
  source: JobSourceId;
  status: SourceHealthStatus;
  consecutive_failures: number;
  last_error: string | null;
  last_ok_at: number | null;
  last_attempted_at: number | null;
};

const QUARANTINE_THRESHOLD = 3;

export function getSourceHealth(db: Database): Map<JobSourceId, SourceHealthRow> {
  const rows = db.query("SELECT * FROM source_health").all() as any[];
  const map = new Map<JobSourceId, SourceHealthRow>();
  for (const r of rows) {
    map.set(r.source as JobSourceId, {
      source: r.source,
      status: r.status,
      consecutive_failures: r.consecutive_failures,
      last_error: r.last_error,
      last_ok_at: r.last_ok_at,
      last_attempted_at: r.last_attempted_at,
    });
  }
  return map;
}

export function listEnabledSources(db: Database): JobSourceId[] {
  const rows = db.query(
    "SELECT source FROM user_source_settings WHERE enabled = 1",
  ).all() as { source: string }[];
  const enabled = new Set(rows.map((r) => r.source));
  return JOB_SOURCE_IDS.filter((id) => enabled.has(id));
}

export function listEligibleSources(db: Database): JobSourceId[] {
  const enabled = new Set(listEnabledSources(db));
  const health = getSourceHealth(db);
  return JOB_SOURCE_IDS.filter((id) => {
    if (!enabled.has(id)) return false;
    const h = health.get(id);
    if (!h) return true;
    return h.status === "ok" || h.status === "broken";
  });
}

export function recordSearchSuccess(db: Database, source: JobSourceId): void {
  const now = Date.now();
  db.query(
    `INSERT INTO source_health (source, status, consecutive_failures, last_ok_at, last_attempted_at, updated_at)
     VALUES (?, 'ok', 0, ?, ?, datetime('now'))
     ON CONFLICT(source) DO UPDATE SET
       status = 'ok',
       consecutive_failures = 0,
       last_error = NULL,
       last_ok_at = excluded.last_ok_at,
       last_attempted_at = excluded.last_attempted_at,
       updated_at = datetime('now')`,
  ).run(source, now, now);
}

export type FailureKind = "zero_insert" | "error";

export function recordSearchFailure(
  db: Database,
  source: JobSourceId,
  kind: FailureKind,
  errorMessage?: string,
): { quarantined: boolean; consecutiveFailures: number } {
  const now = Date.now();
  const existing = db
    .query("SELECT status, consecutive_failures FROM source_health WHERE source = ?")
    .get(source) as { status: SourceHealthStatus; consecutive_failures: number } | null;
  const prevFailures = existing?.consecutive_failures ?? 0;
  const consecutive = prevFailures + 1;
  const willQuarantine = consecutive >= QUARANTINE_THRESHOLD;
  const nextStatus: SourceHealthStatus = willQuarantine ? "quarantined" : "broken";
  const errorPayload = errorMessage ?? (kind === "zero_insert" ? "search returned zero inserts" : "search failed");

  db.query(
    `INSERT INTO source_health (source, status, consecutive_failures, last_error, last_attempted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(source) DO UPDATE SET
       status = excluded.status,
       consecutive_failures = excluded.consecutive_failures,
       last_error = excluded.last_error,
       last_attempted_at = excluded.last_attempted_at,
       updated_at = datetime('now')`,
  ).run(source, nextStatus, consecutive, errorPayload, now);

  return { quarantined: willQuarantine, consecutiveFailures: consecutive };
}

export function setSourceEnabled(db: Database, source: JobSourceId, enabled: boolean): void {
  db.query(
    `INSERT INTO user_source_settings (source, enabled, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(source) DO UPDATE SET
       enabled = excluded.enabled,
       updated_at = datetime('now')`,
  ).run(source, enabled ? 1 : 0);
}

export function restoreSource(db: Database, source: JobSourceId): void {
  db.query(
    `UPDATE source_health
     SET status = 'ok', consecutive_failures = 0, last_error = NULL, updated_at = datetime('now')
     WHERE source = ?`,
  ).run(source);
}
