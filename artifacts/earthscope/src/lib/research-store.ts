import type { ResearchInput, ResearchSelection } from "@workspace/api-client-react";

/** Browser-local only. Nothing here is shared, synced, or uploaded. Selections only, never dataset values. */
export const STORE_KEY = "ecoscope.research.selections.v1";
export const STORE_VERSION = 1;
export const MAX_SAVED = 30;

export type SavedSelection = { id: string; name: string; saved_at: string; input: ResearchInput };
type Envelope = { version: number; items: SavedSelection[] };

const SOURCES = ["power", "noaa", "worldbank"];
const INDICATORS = ["T2M", "PRECTOTCORR", "RH2M", "WS2M", "co2", "forest"];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

export function validSelection(s: unknown): s is ResearchSelection {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return SOURCES.includes(o.source as string) && INDICATORS.includes(o.indicator as string)
    && num(o.latitude, -90, 90) && num(o.longitude, -180, 180)
    && typeof o.country === "string" && /^[A-Z]{3}$/.test(o.country)
    && typeof o.start === "string" && MONTH.test(o.start) && typeof o.end === "string" && MONTH.test(o.end);
}

function cleanSel(s: ResearchSelection): ResearchSelection {
  return { source: s.source, indicator: s.indicator, latitude: s.latitude, longitude: s.longitude, country: s.country, start: s.start, end: s.end };
}

export function validInput(i: unknown): ResearchInput | null {
  if (!i || typeof i !== "object") return null;
  const o = i as Record<string, unknown>;
  if (!validSelection(o.selection)) return null;
  if (o.comparison != null && !validSelection(o.comparison)) return null;
  if (!Number.isInteger(o.baseline_start) || !Number.isInteger(o.baseline_end)) return null;
  if (!num(o.baseline_start, 1979, 2100) || !num(o.baseline_end, 1979, 2100)) return null;
  return {
    selection: cleanSel(o.selection),
    comparison: o.comparison ? cleanSel(o.comparison as ResearchSelection) : null,
    baseline_start: o.baseline_start as number,
    baseline_end: o.baseline_end as number,
  };
}

function validItem(x: unknown): SavedSelection | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || typeof o.saved_at !== "string") return null;
  const name = o.name.trim().slice(0, 80);
  if (!name) return null;
  const input = validInput(o.input);
  return input ? { id: o.id.slice(0, 64), name, saved_at: o.saved_at, input } : null;
}

export type LoadOutcome = { items: SavedSelection[]; warning: string | null };

export function loadSelections(): LoadOutcome {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(STORE_KEY); } catch { return { items: [], warning: "Browser storage is unavailable (private mode or blocked)." }; }
  if (!raw) return { items: [], warning: null };
  try {
    const parsed = JSON.parse(raw) as Envelope;
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.items)) return { items: [], warning: "Stored selections use an unknown format and were ignored." };
    const items = parsed.items.map(validItem).filter((x): x is SavedSelection => !!x).slice(0, MAX_SAVED);
    const dropped = parsed.items.length - items.length;
    return { items, warning: dropped > 0 ? `${dropped} invalid stored selection(s) were skipped.` : null };
  } catch {
    return { items: [], warning: "Stored selections were corrupt and could not be read." };
  }
}

export function persistSelections(items: SavedSelection[]): string | null {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, items: items.slice(0, MAX_SAVED) } satisfies Envelope));
    return null;
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return quota ? "Browser storage quota exceeded. Delete a selection and try again." : "Could not write to browser storage.";
  }
}

export function parseImported(text: string): { items: SavedSelection[]; rejected: number } {
  const parsed = JSON.parse(text) as unknown;
  const arr = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as Envelope).items) ? (parsed as Envelope).items : null;
  if (!arr) throw new Error("File is not an Ecoscope selection list.");
  const items = arr.map(validItem).filter((x): x is SavedSelection => !!x);
  return { items, rejected: arr.length - items.length };
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
