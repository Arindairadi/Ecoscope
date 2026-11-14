import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileJson, FileText, Map as MapIcon, MessageSquareText, Play, Printer, Save, Trash2, Upload } from "lucide-react";
import { useRunResearch, type AnalysisResult, type MethodResult, type ResearchDataset, type ResearchInput, type ResearchResult, type ResearchSelection } from "@workspace/api-client-react";
import { ErrorPanel, Panel, StatusTag } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MAX_SAVED, loadSelections, newId, parseImported, persistSelections, type SavedSelection } from "@/lib/research-store";
import { bundleJson, datasetCsv, datasetJson, downloadBlob, printHtml, reportHtml, safeUrl, serializeSvg } from "@/lib/research-export";

type Source = ResearchSelection["source"];
type Ind = ResearchSelection["indicator"];

const INDICATORS: Record<Source, { id: Ind; label: string }[]> = {
  power: [
    { id: "T2M", label: "T2M · 2 m air temperature" },
    { id: "PRECTOTCORR", label: "PRECTOTCORR · corrected precipitation" },
    { id: "RH2M", label: "RH2M · 2 m relative humidity" },
    { id: "WS2M", label: "WS2M · 2 m wind speed" },
  ],
  noaa: [{ id: "co2", label: "CO2 · global marine surface mean" }],
  worldbank: [{ id: "forest", label: "Forest area · % of land (FAO/WDI)" }],
};
const SOURCE_LABEL: Record<Source, string> = { power: "NASA POWER · point, monthly", noaa: "NOAA GML · global, monthly", worldbank: "World Bank WDI · national, annual" };
const POINTS = [
  { id: "kampala", label: "Kampala, Uganda", lat: 0.3476, lng: 32.5825 },
  { id: "gulu", label: "Gulu, Uganda", lat: 2.7724, lng: 32.2881 },
  { id: "nairobi", label: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219 },
  { id: "manaus", label: "Manaus, Brazil", lat: -3.119, lng: -60.0217 },
];
const COUNTRIES = [
  { iso: "UGA", label: "Uganda" }, { iso: "KEN", label: "Kenya" }, { iso: "TZA", label: "Tanzania" },
  { iso: "RWA", label: "Rwanda" }, { iso: "USA", label: "United States" }, { iso: "BRA", label: "Brazil" },
];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthsBetween = (a: string, b: string) => { const [y1, m1] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };

type Draft = {
  source: Source; indicator: Ind; lat: string; lng: string; country: string; start: string; end: string;
  bStart: string; bEnd: string; compare: boolean; cLat: string; cLng: string; cCountry: string;
};
const DEFAULT: Draft = { source: "power", indicator: "T2M", lat: "0.3476", lng: "32.5825", country: "UGA", start: "1990-01", end: "2024-12", bStart: "1991", bEnd: "2020", compare: false, cLat: "2.7724", cLng: "32.2881", cCountry: "KEN" };

function buildInput(d: Draft): { input: ResearchInput | null; errors: string[] } {
  const e: string[] = [];
  const lat = Number(d.lat), lng = Number(d.lng);
  if (d.source === "power") {
    if (d.lat.trim() === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) e.push("Latitude must be between -90 and 90.");
    if (d.lng.trim() === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) e.push("Longitude must be between -180 and 180.");
  }
  if (d.source === "worldbank" && !/^[A-Z]{3}$/.test(d.country)) e.push("Country must be a 3-letter ISO3 code (e.g. UGA).");
  if (!MONTH.test(d.start) || !MONTH.test(d.end)) e.push("Start and end must be YYYY-MM.");
  else if (d.start > d.end) e.push("Start must not be after end.");
  else if (monthsBetween(d.start, d.end) > 600) e.push(`Range is ${monthsBetween(d.start, d.end)} months; the maximum is 600.`);
  const bs = Number(d.bStart), be = Number(d.bEnd);
  if (!Number.isInteger(bs) || !Number.isInteger(be) || bs < 1979 || be > 2100 || bs > be) e.push("Baseline years must be integers 1979-2100 with start <= end.");
  else if (bs < Number(d.start.slice(0, 4)) || be > Number(d.end.slice(0, 4))) e.push("Baseline years must be inside the requested data window.");
  if (MONTH.test(d.end) && d.end > new Date().toISOString().slice(0, 7)) e.push("Future data are unavailable; this is not a forecasting service.");
  if (d.source === "worldbank" && (d.start.slice(5) !== "01" || d.end.slice(5) !== "12")) e.push("Annual forest data requires January–December year boundaries.");
  const safeLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : 0;
  const safeLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : 0;
  const selection: ResearchSelection = { source: d.source, indicator: d.indicator, latitude: safeLat, longitude: safeLng, country: /^[A-Z]{3}$/.test(d.country) ? d.country : "UGA", start: d.start, end: d.end };
  let comparison: ResearchSelection | null = null;
  if (d.compare) {
    if (d.source === "noaa") e.push("NOAA CO2 is a single global series; a different-location comparison is not possible.");
    else if (d.source === "power") {
      const cl = Number(d.cLat), cg = Number(d.cLng);
      if (d.cLat.trim() === "" || !Number.isFinite(cl) || cl < -90 || cl > 90 || d.cLng.trim() === "" || !Number.isFinite(cg) || cg < -180 || cg > 180) e.push("Comparison point coordinates are out of range.");
      else if (cl === lat && cg === lng) e.push("Comparison point must differ from the primary point.");
      else comparison = { ...selection, latitude: cl, longitude: cg };
    } else {
      if (!/^[A-Z]{3}$/.test(d.cCountry)) e.push("Comparison country must be a 3-letter ISO3 code.");
      else if (d.cCountry === d.country) e.push("Comparison country must differ from the primary country.");
      else comparison = { ...selection, country: d.cCountry };
    }
  }
  return e.length ? { input: null, errors: e } : { input: { selection, comparison, baseline_start: bs, baseline_end: be }, errors: [] };
}

function draftFrom(i: ResearchInput): Draft {
  const s = i.selection, c = i.comparison;
  return { source: s.source, indicator: s.indicator, lat: String(s.latitude), lng: String(s.longitude), country: s.country, start: s.start, end: s.end,
    bStart: String(i.baseline_start), bEnd: String(i.baseline_end), compare: !!c,
    cLat: c ? String(c.latitude) : DEFAULT.cLat, cLng: c ? String(c.longitude) : DEFAULT.cLng, cCountry: c ? c.country : DEFAULT.cCountry };
}

const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
const lbl = "mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-sm border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none";
const fmt = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? null : n.toFixed(d));

type View = "raw" | "anomaly" | "zscore" | "spi3" | "annual" | "seasonal";

export default function Research() {
  const [draft, setDraft] = useState<Draft>(DEFAULT);
  const [applied, setApplied] = useState<ResearchInput | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [answer, setAnswer] = useState<{ q: string; r: ResearchResult } | null>(null);
  const [question, setQuestion] = useState("");
  const [runError, setRunError] = useState<unknown>(null);
  const [askError, setAskError] = useState<unknown>(null);
  const [view, setView] = useState<View>("raw");
  const [notice, setNotice] = useState<string | null>(null);
  const reqId = useRef(0);
  const askId = useRef(0);
  const run = useRunResearch();
  const ask = useRunResearch();
  const runRef = useRef(run.mutateAsync); runRef.current = run.mutateAsync;
  const askRef = useRef(ask.mutateAsync); askRef.current = ask.mutateAsync;
  const chartRef = useRef<HTMLDivElement>(null);

  const { input: draftInput, errors } = useMemo(() => buildInput(draft), [draft]);
  const pending = !!applied && JSON.stringify(draftInput) !== JSON.stringify(applied);

  const execute = async (input: ResearchInput) => {
    const id = ++reqId.current;
    askId.current++;
    setApplied(input); setRunError(null); setResult(null); setAnswer(null); setAskError(null);
    try {
      const r = await runRef.current({ data: input });
      if (id === reqId.current) setResult(r);
    } catch (e) { if (id === reqId.current) setRunError(e); }
  };
  const doAsk = async () => {
    if (!applied || !question.trim()) return;
    const id = ++askId.current; const base = reqId.current; const q = question.trim().slice(0, 500);
    setAskError(null); setAnswer(null);
    try {
      const r = await askRef.current({ data: { ...applied, question: q } });
      if (id === askId.current && base === reqId.current) setAnswer({ q, r });
    } catch (e) { if (id === askId.current) setAskError(e); }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSource = (s: Source) => setDraft((d) => ({ ...d, source: s, indicator: INDICATORS[s][0].id, compare: s === "noaa" ? false : d.compare }));

  // saved selections
  const [saved, setSaved] = useState<SavedSelection[]>([]);
  const [storeWarn, setStoreWarn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pick, setPick] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const o = loadSelections(); setSaved(o.items); setStoreWarn(o.warning); }, []);
  const commit = (items: SavedSelection[], msg: string) => {
    const err = persistSelections(items);
    if (err) { setStoreWarn(err); return; }
    setSaved(items); setStoreWarn(null); setNotice(msg);
  };
  const save = () => {
    if (!draftInput || !name.trim()) return;
    const n = name.trim().slice(0, 80);
    const existing = saved.find((s) => s.name === n);
    const item: SavedSelection = { id: existing?.id ?? newId(), name: n, saved_at: new Date().toISOString(), input: draftInput };
    const rest = saved.filter((s) => s.id !== item.id);
    if (!existing && rest.length >= MAX_SAVED) { setStoreWarn(`Limit of ${MAX_SAVED} saved selections reached. Delete one first.`); return; }
    commit([item, ...rest], existing ? `Updated "${n}" in this browser.` : `Saved "${n}" in this browser.`);
    setPick(item.id); setName("");
  };
  const load = () => { const s = saved.find((x) => x.id === pick); if (s) { setDraft(draftFrom(s.input)); setNotice(`Loaded "${s.name}". Press Run to fetch evidence.`); } };
  const del = () => { const s = saved.find((x) => x.id === pick); if (s && window.confirm(`Delete "${s.name}" from this browser?`)) { commit(saved.filter((x) => x.id !== pick), `Deleted "${s.name}".`); setPick(""); } };
  const exportSel = () => downloadBlob(JSON.stringify({ version: 1, items: saved }, null, 2), "ecoscope-selections.json", "application/json");
  const importSel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 512_000) { setStoreWarn("Import file is too large."); return; }
    try {
      const { items, rejected } = parseImported(await file.text());
      const merged = [...items.map((i) => ({ ...i, id: newId() })), ...saved].slice(0, MAX_SAVED);
      commit(merged, `Imported ${items.length} selection(s)${rejected ? `, rejected ${rejected} invalid` : ""}.`);
    } catch (err) { setStoreWarn(err instanceof Error ? `Import failed: ${err.message}` : "Import failed."); }
  };

  const r = result;
  const slug = r ? `${r.dataset.id}_${r.dataset.requested_start}_${r.dataset.requested_end}` : "research";
  const exportChart = () => { const svg = chartRef.current?.querySelector("svg.recharts-surface") as SVGSVGElement | null; if (svg) downloadBlob(serializeSvg(svg), `ecoscope-chart_${view}_${slug}.svg`, "image/svg+xml"); };
  const fullResult = answer?.r ?? r;

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 md:p-5">
      <header className="es-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Evidence desk</div>
          <h1 className="font-serif text-2xl md:text-3xl">Inspect the evidence before the finding.</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Multi-source analysis over NASA POWER points, NOAA global CO2 and World Bank national forest cover. Every number shown is computed by the server from the retrieved record; trend claims appear only where a method reports itself eligible.</p>
        </div>
        <Link href="/explorer" data-testid="link-research-explorer" className="inline-flex items-center gap-1.5 rounded-sm border bg-card px-3 py-1.5 text-xs hover:bg-muted"><MapIcon className="h-3.5 w-3.5" /> Imagery explorer</Link>
      </header>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <Panel label="Selection">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (draftInput) void execute(draftInput); }}>
              <div><label className={lbl} htmlFor="r-src">Source</label>
                <select id="r-src" data-testid="select-research-source" className={field} value={draft.source} onChange={(e) => setSource(e.target.value as Source)}>
                  {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                </select></div>
              <div><label className={lbl} htmlFor="r-ind">Indicator</label>
                <select id="r-ind" data-testid="select-research-indicator" className={field} value={draft.indicator} onChange={(e) => set("indicator", e.target.value as Ind)}>
                  {INDICATORS[draft.source].map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select></div>

              {draft.source === "power" && (
                <div className="space-y-2">
                  <div><label className={lbl} htmlFor="r-preset">Point preset</label>
                    <select id="r-preset" data-testid="select-research-preset" className={field} value={POINTS.find((p) => String(p.lat) === draft.lat && String(p.lng) === draft.lng)?.id ?? "custom"}
                      onChange={(e) => { const p = POINTS.find((x) => x.id === e.target.value); if (p) setDraft((d) => ({ ...d, lat: String(p.lat), lng: String(p.lng) })); }}>
                      {POINTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="custom">Custom coordinates</option>
                    </select></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={lbl} htmlFor="r-lat">Latitude</label><input id="r-lat" data-testid="input-research-latitude" type="number" step="any" min={-90} max={90} className={field} value={draft.lat} onChange={(e) => set("lat", e.target.value)} /></div>
                    <div><label className={lbl} htmlFor="r-lng">Longitude</label><input id="r-lng" data-testid="input-research-longitude" type="number" step="any" min={-180} max={180} className={field} value={draft.lng} onChange={(e) => set("lng", e.target.value)} /></div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Point value of a ~0.5 degree model grid cell. Not a station, not a national average.</p>
                </div>
              )}
              {draft.source === "worldbank" && <CountryField id="r-country" testid="input-research-country" value={draft.country} onChange={(v) => set("country", v)} label="Country (ISO3)" />}
              {draft.source === "noaa" && <p data-testid="text-research-global" className="rounded-sm border border-dashed p-2 text-[11px] text-muted-foreground">Global marine surface mean. Coordinates and country do not apply.</p>}

              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl} htmlFor="r-start">Start</label><input id="r-start" data-testid="input-research-start" type="month" className={field} value={draft.start} onChange={(e) => set("start", e.target.value)} /></div>
                <div><label className={lbl} htmlFor="r-end">End</label><input id="r-end" data-testid="input-research-end" type="month" className={field} value={draft.end} onChange={(e) => set("end", e.target.value)} /></div>
                <div><label className={lbl} htmlFor="r-bs">Baseline start</label><input id="r-bs" data-testid="input-baseline-start" type="number" min={1979} max={2100} className={field} value={draft.bStart} onChange={(e) => set("bStart", e.target.value)} /></div>
                <div><label className={lbl} htmlFor="r-be">Baseline end</label><input id="r-be" data-testid="input-baseline-end" type="number" min={1979} max={2100} className={field} value={draft.bEnd} onChange={(e) => set("bEnd", e.target.value)} /></div>
              </div>

              <div className="rounded-sm border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" data-testid="checkbox-compare" checked={draft.compare} disabled={draft.source === "noaa"} onChange={(e) => set("compare", e.target.checked)} className="accent-[hsl(var(--primary))]" />
                  Compare with a second {draft.source === "worldbank" ? "country" : "point"}
                </label>
                {draft.source === "noaa" && <p className="mt-1 text-[11px] text-muted-foreground">Not available: NOAA CO2 is one global series.</p>}
                {draft.compare && draft.source === "power" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><label className={lbl} htmlFor="c-lat">Compare lat</label><input id="c-lat" data-testid="input-compare-latitude" type="number" step="any" className={field} value={draft.cLat} onChange={(e) => set("cLat", e.target.value)} /></div>
                    <div><label className={lbl} htmlFor="c-lng">Compare lng</label><input id="c-lng" data-testid="input-compare-longitude" type="number" step="any" className={field} value={draft.cLng} onChange={(e) => set("cLng", e.target.value)} /></div>
                  </div>
                )}
                {draft.compare && draft.source === "worldbank" && <div className="mt-2"><CountryField id="c-country" testid="input-compare-country" value={draft.cCountry} onChange={(v) => set("cCountry", v)} label="Compare country (ISO3)" /></div>}
                {draft.compare && <p className="mt-1 text-[11px] text-muted-foreground">Same source, indicator, unit and exact range. Statistics use matched periods only.</p>}
              </div>

              {errors.length > 0 && <ul data-testid="text-research-validation" className="space-y-0.5 text-xs text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <button type="submit" data-testid="button-run-research" disabled={!draftInput || run.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Play className="h-3.5 w-3.5" /> {run.isPending ? "Retrieving and analysing..." : "Run analysis"}
              </button>
              {pending && <p data-testid="text-research-pending" className="rounded-sm border border-accent/40 bg-accent/10 p-2 text-xs">Selection edited. Results still describe the last applied run.</p>}
            </form>
          </Panel>

          <Panel label="Saved selections" right={<span className="font-mono text-[10px] text-muted-foreground">{saved.length}/{MAX_SAVED} · this browser only</span>}>
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">Stored in localStorage on this device. Not shared, not synced, not uploaded. Only the selection is saved, never dataset values.</p>
              <div className="flex gap-2">
                <input aria-label="Selection name" data-testid="input-selection-name" maxLength={80} placeholder="Name, e.g. Gulu rainfall 1990s" className={field} value={name} onChange={(e) => setName(e.target.value)} />
                <button data-testid="button-save-selection" className={btn} disabled={!draftInput || !name.trim()} onClick={save}><Save className="h-3.5 w-3.5" /> Save</button>
              </div>
              <select aria-label="Saved selection" data-testid="select-saved-selection" className={field} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{saved.length ? "Choose a saved selection" : "No saved selections yet"}</option>
                {saved.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.input.selection.source}/{s.input.selection.indicator}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                <button data-testid="button-load-selection" className={btn} disabled={!pick} onClick={load}>Load</button>
                <button data-testid="button-delete-selection" className={cn(btn, "text-destructive")} disabled={!pick} onClick={del}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                <button data-testid="button-export-selections" className={btn} disabled={!saved.length} onClick={exportSel}><Download className="h-3.5 w-3.5" /> Export list</button>
                <button data-testid="button-import-selections" className={btn} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Import</button>
                <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importSel} data-testid="input-import-selections" />
              </div>
              {storeWarn && <p data-testid="text-store-warning" className="text-xs text-destructive">{storeWarn}</p>}
              {notice && <p data-testid="text-store-notice" className="text-xs text-primary">{notice}</p>}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          <section data-testid="panel-research-results" className="space-y-3">
            {!applied && (
              <div className="grid-paper flex min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
                <div className="font-serif text-xl">No evidence retrieved yet</div>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">Choose a source, place and window, then run. The server fetches the record, fingerprints it and computes trend, seasonality and anomaly diagnostics.</p>
              </div>
            )}
            {run.isPending && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-[340px]" /><Skeleton className="h-40" /></div>}
            {!!runError && !run.isPending && applied && <ErrorPanel title="Analysis request failed" error={runError} onRetry={() => void execute(applied)} retrying={run.isPending} />}
            {r && !run.isPending && applied && (
              <>
                <DatasetHeader ds={r.dataset} a={r.analysis} r={r} />
                <Panel label="Exploration" right={
                  <div className="flex flex-wrap gap-1.5">
                    <button data-testid="button-export-csv" className={btn} onClick={() => downloadBlob(datasetCsv(r.dataset), `ecoscope_${slug}.csv`, "text/csv")}><Download className="h-3 w-3" /> CSV</button>
                    <button data-testid="button-export-json" className={btn} onClick={() => downloadBlob(datasetJson(r.dataset), `ecoscope_${slug}.json`, "application/json")}><FileJson className="h-3 w-3" /> JSON</button>
                    <button data-testid="button-export-chart" className={btn} onClick={exportChart}><Download className="h-3 w-3" /> SVG</button>
                    <button data-testid="button-export-bundle" className={btn} onClick={() => downloadBlob(bundleJson(applied, fullResult as ResearchResult), `ecoscope-bundle_${slug}.json`, "application/json")}><FileJson className="h-3 w-3" /> Bundle</button>
                    <button data-testid="button-export-report" className={btn} onClick={() => downloadBlob(reportHtml(applied, fullResult as ResearchResult), `ecoscope-report_${slug}.html`, "text/html")}><FileText className="h-3 w-3" /> Report</button>
                    <button data-testid="button-print-report" className={btn} onClick={() => { if (!printHtml(reportHtml(applied, fullResult as ResearchResult))) setNotice("Pop-up blocked. Download the report and print it instead."); }}><Printer className="h-3 w-3" /> Print</button>
                  </div>
                }>
                  <ViewTabs view={view} setView={setView} hasSpi={r.analysis.anomalies.some((x) => x.spi3 !== null)} monthly={r.dataset.frequency === "monthly"} />
                  <div ref={chartRef} data-testid="chart-research" className="mt-3 h-[340px]">
                    <ResearchChart r={r} view={view} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Gaps in the record are drawn as breaks, never interpolated. Anomalies relative to baseline {r.analysis.baseline}.</p>
                </Panel>
                <MethodsPanel a={r.analysis} />
                {r.comparison && r.comparison_dataset && <ComparisonPanel r={r} />}
                <Panel label="Evidence Q&A" right={<span data-testid="text-explanation-mode" className="font-mono text-[10px] uppercase text-muted-foreground">deterministic · rule-based</span>}>
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void doAsk(); }}>
                    <label className={lbl} htmlFor="r-q">Question about the applied selection</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input id="r-q" data-testid="input-research-question" maxLength={500} className={field} placeholder="Is there a statistically supported warming trend?" value={question} onChange={(e) => setQuestion(e.target.value)} />
                      <button type="submit" data-testid="button-ask-research" disabled={!question.trim() || ask.isPending} className={cn(btn, "bg-primary text-primary-foreground hover:opacity-90")}><MessageSquareText className="h-3.5 w-3.5" /> {ask.isPending ? "Answering..." : "Ask"}</button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Answered by server-side rules over the same applied selection and baseline. No generative AI; it can only restate computed results.</p>
                  </form>
                  {ask.isPending && <Skeleton className="mt-3 h-16" />}
                  {!!askError && !ask.isPending && <div className="mt-3"><ErrorPanel title="Question could not be answered" error={askError} onRetry={() => void doAsk()} /></div>}
                  {answer && !ask.isPending && (
                    <div className="mt-3 rounded-sm border-l-2 border-accent bg-muted/40 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Q: {answer.q} · {answer.r.explanation_mode} · {answer.r.generated_at}</div>
                      <p data-testid="text-research-answer" className="mt-1 whitespace-pre-wrap text-sm">{answer.r.answer || "The server returned no answer for this question."}</p>
                    </div>
                  )}
                </Panel>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function CountryField({ id, testid, value, onChange, label }: { id: string; testid: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className={lbl} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <select aria-label={`${label} preset`} data-testid={`${testid}-preset`} className={field} value={COUNTRIES.some((c) => c.iso === value) ? value : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.label} ({c.iso})</option>)}<option value="">Custom ISO3</option>
        </select>
        <input id={id} data-testid={testid} maxLength={3} className={cn(field, "w-20 font-mono uppercase")} value={value} onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
      </div>
    </div>
  );
}

function DatasetHeader({ ds, a, r }: { ds: ResearchDataset; a: AnalysisResult; r: ResearchResult }) {
  const src = safeUrl(ds.source_url), doc = safeUrl(ds.documentation_url);
  return (
    <Panel label="Evidence record" right={<StatusTag status={a.status} />}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><div className="font-serif text-xl" data-testid="text-dataset-label">{ds.label}</div><div className="text-sm text-muted-foreground">{ds.location} · {ds.spatial_scope}</div></div>
        <div className="font-mono text-[11px] text-muted-foreground">generated {r.generated_at}</div>
      </div>
      <dl data-testid="panel-research-provenance" className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["Source", ds.source], ["Kind", ds.kind], ["Unit · frequency", `${ds.unit} · ${ds.frequency}`], ["Resolution", ds.resolution],
          ["Requested", `${ds.requested_start} to ${ds.requested_end}`], ["Available", `${ds.available_start ?? "none"} to ${ds.available_end ?? "none"}`],
          ["Coverage", `${ds.valid_count}/${ds.expected_count} · ${ds.coverage_percent.toFixed(1)}%`], ["Retrieved", ds.retrieved_at ?? "not reported"],
          ["License", ds.license], ["Attribution", ds.attribution],
        ] as const).map(([k, v]) => <div key={k}><dt className={lbl}>{k}</dt><dd className="break-words">{v}</dd></div>)}
        <div className="sm:col-span-2"><dt className={lbl}>SHA-256 fingerprint</dt><dd data-testid="text-fingerprint" className="break-all font-mono text-[11px]">{ds.fingerprint}</dd></div>
        <div className="sm:col-span-2"><dt className={lbl}>Links</dt><dd className="flex gap-3">{src ? <a href={src} target="_blank" rel="noreferrer" data-testid="link-research-source" className="text-primary hover:underline">Source request</a> : <span className="text-muted-foreground">source URL withheld</span>}{doc && <a href={doc} target="_blank" rel="noreferrer" data-testid="link-research-docs" className="text-primary hover:underline">Documentation</a>}</dd></div>
      </dl>
      {[...ds.warnings, ...a.warnings].length > 0 && (
        <ul data-testid="list-research-warnings" className="mt-3 space-y-1 rounded-sm border border-accent/40 bg-accent/5 p-2 text-xs">
          {[...ds.warnings, ...a.warnings].map((w, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-2 shrink-0 bg-accent" />{w}</li>)}
        </ul>
      )}
    </Panel>
  );
}

function ViewTabs({ view, setView, hasSpi, monthly }: { view: View; setView: (v: View) => void; hasSpi: boolean; monthly: boolean }) {
  const tabs: { id: View; label: string; ok: boolean }[] = [
    { id: "raw", label: "Raw values", ok: true }, { id: "anomaly", label: "Anomaly", ok: true }, { id: "zscore", label: "Z-score", ok: true },
    { id: "spi3", label: "SPI-3", ok: hasSpi }, { id: "annual", label: "Annual", ok: true }, { id: "seasonal", label: "Seasonal cycle", ok: monthly },
  ];
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={view === t.id} data-testid={`tab-view-${t.id}`} disabled={!t.ok} onClick={() => setView(t.id)}
          className={cn("rounded-sm border px-2.5 py-1 text-xs disabled:opacity-40", view === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{t.label}</button>
      ))}
    </div>
  );
}

const axis = { fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--app-font-mono)" };
const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12, borderRadius: 4 }, labelStyle: { color: "hsl(var(--foreground))" } };

function ResearchChart({ r, view }: { r: ResearchResult; view: View }) {
  const unit = r.dataset.unit;
  const cmp = r.comparison_dataset;
  const data = useMemo(() => {
    if (view === "raw") {
      const m = new Map<string, { period: string; a: number | null; b: number | null }>();
      r.dataset.values.forEach((v) => m.set(v.period, { period: v.period, a: v.value, b: null }));
      cmp?.values.forEach((v) => { const e = m.get(v.period) ?? { period: v.period, a: null, b: null }; e.b = v.value; m.set(v.period, e); });
      return [...m.values()].sort((x, y) => x.period.localeCompare(y.period));
    }
    if (view === "annual") {
      const m = new Map<string, { period: string; a: number | null; b: number | null }>();
      r.analysis.annual_values.forEach((v) => m.set(v.period, { period: v.period, a: v.value, b: null }));
      r.comparison_analysis?.annual_values.forEach((v) => { const e = m.get(v.period) ?? { period: v.period, a: null, b: null }; e.b = v.value; m.set(v.period, e); });
      return [...m.values()].sort((x, y) => x.period.localeCompare(y.period));
    }
    if (view === "seasonal") return r.analysis.seasonality.map((s) => ({ period: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][s.month - 1] ?? String(s.month), a: s.mean, sd: s.std, n: s.count }));
    const key = view === "anomaly" ? "difference" : view === "zscore" ? "z_score" : "spi3";
    return r.analysis.anomalies.map((x) => ({ period: x.period, a: x[key], outlier: x.outlier ? x[key] : null }));
  }, [r, view, cmp]);

  if (!data.length || data.every((d) => d.a === null)) {
    return <div className="grid-paper flex h-full items-center justify-center rounded-sm border border-dashed text-sm text-muted-foreground" data-testid="state-chart-empty">No values available for this view. Nothing is plotted rather than inventing a series.</div>;
  }
  const yLabel = view === "zscore" || view === "spi3" ? "index (unitless)" : unit;
  if (view === "seasonal") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="period" tick={axis} /><YAxis tick={axis} width={52} label={{ value: unit, angle: -90, position: "insideLeft", style: axis }} />
          <Tooltip {...tip} formatter={(v: number) => [v === null ? "no data" : v.toFixed(3), `Baseline mean (${unit})`]} />
          <Bar dataKey="a" name="Baseline monthly mean" fill="hsl(var(--chart-1))" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const anomaly = view === "anomaly" || view === "zscore" || view === "spi3";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" tick={axis} minTickGap={36} />
        <YAxis tick={axis} width={52} domain={["auto", "auto"]} label={{ value: yLabel, angle: -90, position: "insideLeft", style: axis }} />
        <Tooltip {...tip} formatter={(v: unknown, n: string) => [v === null || v === undefined ? "gap" : Number(v).toFixed(4), n]} />
        {anomaly && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />}
        {view === "spi3" && <><ReferenceLine y={-1} stroke="hsl(var(--accent))" strokeDasharray="3 3" /><ReferenceLine y={-2} stroke="hsl(var(--destructive))" strokeDasharray="3 3" /></>}
        <Line type="linear" dataKey="a" name={view === "raw" || view === "annual" ? r.dataset.location : yLabel} stroke="hsl(var(--chart-1))" dot={view === "annual" || data.length < 40 ? { r: 2 } : false} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
        {cmp && (view === "raw" || view === "annual") && <Line type="linear" dataKey="b" name={cmp.location} stroke="hsl(var(--chart-2))" dot={view === "annual" ? { r: 2 } : false} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />}
        {anomaly && <Line dataKey="outlier" name="Flagged outlier" stroke="none" dot={{ r: 3, fill: "hsl(var(--accent))" }} connectNulls={false} isAnimationActive={false} legendType="circle" />}
        {(cmp && (view === "raw" || view === "annual")) || anomaly ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MethodCard({ m, id }: { m: MethodResult; id: string }) {
  const hasCI = m.lower !== null && m.upper !== null;
  return (
    <div data-testid={`card-method-${id}`} className="rounded-sm border p-3">
      <div className="flex items-start justify-between gap-2"><div className="text-sm font-medium">{m.label}</div><StatusTag status={m.status} /></div>
      {m.estimate !== null ? (
        <div className="mt-2 font-mono text-lg" data-testid={`text-method-estimate-${id}`}>{m.estimate.toFixed(4)} <span className="text-xs text-muted-foreground">{m.unit}</span></div>
      ) : <div className="mt-2 font-mono text-sm text-muted-foreground" data-testid={`text-method-estimate-${id}`}>estimate not available</div>}
      <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
        <div>95% CI: {hasCI ? `${fmt(m.lower, 4)} to ${fmt(m.upper, 4)}` : "not available"}</div>
        <div>p: {m.p_value !== null ? fmt(m.p_value, 4) : "not reported"}</div>
      </div>
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{m.details}</p>
    </div>
  );
}

function MethodsPanel({ a }: { a: AnalysisResult }) {
  return (
    <Panel label="Findings and method limits" right={<span className="font-mono text-[10px] text-muted-foreground">{a.method_version} · n={a.n} · {a.complete_years} complete yrs</span>}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground"><span>window {a.window}</span><span>baseline {a.baseline}</span><span>coverage {a.coverage_percent.toFixed(1)}%</span></div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <MethodCard m={a.ols} id="ols" /><MethodCard m={a.sen} id="sen" /><MethodCard m={a.mann_kendall} id="mann-kendall" /><MethodCard m={a.change_point} id="change-point" /><MethodCard m={a.spi} id="spi" />
      </div>
      <div className="mt-3">
        <div className={lbl}>Rule-based interpretation</div>
        {a.interpretation.length ? (
          <ul data-testid="list-interpretation" className="space-y-1 text-sm">{a.interpretation.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-3 shrink-0 bg-primary" />{t}</li>)}</ul>
        ) : <p className="text-sm text-muted-foreground">The server drew no conclusions; data may be insufficient for eligible tests.</p>}
      </div>
    </Panel>
  );
}

function ComparisonPanel({ r }: { r: ResearchResult }) {
  const c = r.comparison!; const b = r.comparison_dataset!; const ba = r.comparison_analysis;
  return (
    <Panel label="Matched comparison" right={<StatusTag status={c.status} />}>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-sm border-l-2 border-[hsl(var(--chart-1))] p-2"><div className={lbl}>Primary</div>{r.dataset.location}<div className="break-all font-mono text-[10px] text-muted-foreground">{r.dataset.fingerprint}</div></div>
        <div className="rounded-sm border-l-2 border-[hsl(var(--chart-2))] p-2"><div className={lbl}>Comparison</div>{b.location}<div className="break-all font-mono text-[10px] text-muted-foreground">{b.fingerprint}</div></div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border sm:grid-cols-4" data-testid="panel-comparison-stats">
        {([["Matched periods", String(c.matched_count)], ["Mean difference", c.mean_difference !== null ? `${c.mean_difference.toFixed(4)} ${c.unit}` : null], ["Pearson r", fmt(c.pearson)], ["Spearman rho", fmt(c.spearman)]] as const).map(([k, v]) => (
          <div key={k} className="bg-card p-2.5"><dt className={lbl}>{k}</dt><dd className="font-mono">{v ?? <span className="text-muted-foreground">not available</span>}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{c.method}</p>
      {c.warnings.length > 0 && <ul className="mt-2 space-y-1 text-xs">{c.warnings.map((w, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-2 shrink-0 bg-accent" />{w}</li>)}</ul>}
      {ba && <div className="mt-3"><div className={lbl}>Comparison trend methods</div><div className="grid gap-2 md:grid-cols-2"><MethodCard m={ba.sen} id="cmp-sen" /><MethodCard m={ba.mann_kendall} id="cmp-mann-kendall" /></div></div>}
      <details className="mt-3 rounded-sm border">
        <summary data-testid="toggle-comparison-table" className="cursor-pointer px-2 py-1.5 text-xs font-medium">Matched rows ({c.values.length})</summary>
        <div className="max-h-64 overflow-auto"><table className="w-full font-mono text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left">Period</th><th className="px-2 py-1 text-right">Primary</th><th className="px-2 py-1 text-right">Comparison</th><th className="px-2 py-1 text-right">Diff</th></tr></thead>
          <tbody>{c.values.map((v) => <tr key={v.period} className="border-t"><td className="px-2 py-0.5">{v.period}</td><td className="px-2 py-0.5 text-right">{v.left}</td><td className="px-2 py-0.5 text-right">{v.right}</td><td className="px-2 py-0.5 text-right">{v.difference}</td></tr>)}</tbody></table></div>
      </details>
    </Panel>
  );
}
