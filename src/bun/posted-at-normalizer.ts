import type { PostedAtConfidence } from "../shared/types";

export type NormalizedPostedAt = {
  postedAtTs: number | null;
  confidence: PostedAtConfidence;
};

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const RELATIVE_UNIT_MS: Record<string, number> = {
  minute: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  hour: ONE_HOUR,
  hr: ONE_HOUR,
  hrs: ONE_HOUR,
  day: ONE_DAY,
  week: 7 * ONE_DAY,
  wk: 7 * ONE_DAY,
  month: 30 * ONE_DAY,
  mo: 30 * ONE_DAY,
  year: 365 * ONE_DAY,
  yr: 365 * ONE_DAY,
};

export function normalizePostedAt(raw: string | null | undefined, fetchedAt: number = Date.now()): NormalizedPostedAt {
  if (!raw) return { postedAtTs: null, confidence: "missing" };
  const trimmed = raw.trim();
  if (!trimmed) return { postedAtTs: null, confidence: "missing" };

  const iso = tryParseISO(trimmed);
  if (iso !== null) return { postedAtTs: iso, confidence: "exact" };

  const lower = trimmed.toLowerCase();

  if (/^(just\s+now|moments?\s+ago|few\s+(seconds|minutes)\s+ago|posted\s+now)$/.test(lower)) {
    return { postedAtTs: fetchedAt, confidence: "relative" };
  }

  if (/^(today|posted\s+today)$/.test(lower)) {
    return { postedAtTs: fetchedAt - ONE_HOUR, confidence: "relative" };
  }

  if (/^(yesterday|posted\s+yesterday)$/.test(lower)) {
    return { postedAtTs: fetchedAt - ONE_DAY, confidence: "relative" };
  }

  const relative = parseRelative(lower, fetchedAt);
  if (relative !== null) return { postedAtTs: relative, confidence: "relative" };

  const explicitDate = parseExplicitDate(trimmed, fetchedAt);
  if (explicitDate !== null) return { postedAtTs: explicitDate, confidence: "estimated" };

  return { postedAtTs: null, confidence: "missing" };
}

function tryParseISO(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function parseRelative(lower: string, fetchedAt: number): number | null {
  const match = lower.match(/(\d+)\s*\+?\s*(minute|min|mins|hour|hr|hrs|day|week|wk|month|mo|year|yr)s?\s*(ago|back)?/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const ms = RELATIVE_UNIT_MS[unit];
  if (!ms) return null;
  return fetchedAt - n * ms - ms / 2;
}

function parseExplicitDate(s: string, fetchedAt: number): number | null {
  // "12 May", "12 May 2026", "May 12", "May 12, 2026", "Posted on 12 May"
  const cleaned = s.replace(/^posted\s+on\s+/i, "").replace(/^posted\s+/i, "").trim();

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/);
  if (dmy) {
    return buildDate(parseInt(dmy[1]!, 10), monthFor(dmy[2]!), dmy[3] ? parseInt(dmy[3], 10) : null, fetchedAt);
  }

  const mdy = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (mdy) {
    return buildDate(parseInt(mdy[2]!, 10), monthFor(mdy[1]!), mdy[3] ? parseInt(mdy[3], 10) : null, fetchedAt);
  }

  return null;
}

function monthFor(token: string): number | null {
  const idx = MONTH_INDEX[token.toLowerCase()];
  return idx === undefined ? null : idx;
}

function buildDate(day: number, month: number | null, year: number | null, fetchedAt: number): number | null {
  if (month === null || !Number.isFinite(day) || day < 1 || day > 31) return null;
  const fetchedDate = new Date(fetchedAt);
  const assumedYear = year ?? fetchedDate.getUTCFullYear();
  const candidate = Date.UTC(assumedYear, month, day, 12, 0, 0);
  if (year === null && candidate > fetchedAt + ONE_DAY) {
    return Date.UTC(assumedYear - 1, month, day, 12, 0, 0);
  }
  return candidate;
}
