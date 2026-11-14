import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Download, LineChart as LineIcon, MapPin, Play } from "lucide-react";
import {
  getGetFoundationQueryKey, getGetIndicatorsQueryKey, getGetPowerMonthlyQueryKey, getGetRegionsQueryKey, getGetSeriesQueryKey,
  useGetFoundation, useGetIndicators, useGetPowerMonthly, useGetRegions, useGetSeries,
  type GetPowerMonthlyParams, type PowerSeries,
} from "@workspace/api-client-react";
import { EarthMap, type Pt, type View } from "@/components/earth-map";
import { SeriesChart } from "@/components/series-chart";
import { PowerChart } from "@/components/power-chart";
import { ErrorPanel, Panel, StatusTag } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";
const lbl = "mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground";

const PRESETS = {
  kampala: { name: "Kampala", lat: 0.3476, lng: 32.5825 },
  gulu: { name: "Gulu", lat: 2.7746, lng: 32.299 },
} as const;
type PresetId = keyof typeof PRESETS | "custom";

const MIN_MONTH = "1981-01";
const MAX_MONTHS = 240;
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5)) + 1;

type Draft = { preset: PresetId; lat: string; lng: string; start: string; end: string };

function validate(d: Draft): { params: GetPowerMonthlyParams | null; errors: string[] } {
  const errors: string[] = [];
  const lat = d.lat.trim() === "" ? NaN : Number(d.lat);
  const lng = d.lng.trim() === "" ? NaN : Number(d.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push("Latitude must be a number between -90 and 90.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push("Longitude must be a number between -180 and 180.");
  const cur = nowMonth();
  if (!monthRe.test(d.start)) errors.push("Start month must be YYYY-MM.");
  if (!monthRe.test(d.end)) errors.push("End month must be YYYY-MM.");
  if (monthRe.test(d.start) && d.start < MIN_MONTH) errors.push("Start month cannot be before 1981-01.");
  if (monthRe.test(d.end) && d.end > cur) errors.push(`End month cannot be beyond the current month (${cur}).`);
  if (monthRe.test(d.start) && monthRe.test(d.end)) {
    if (d.start > d.end) errors.push("Start month must be on or before end month.");
    else if (monthsBetween(d.start, d.end) > MAX_MONTHS) errors.push(`Range spans ${monthsBetween(d.start, d.end)} months; maximum is ${MAX_MONTHS}.`);
  }
  return { params: errors.length ? null : { latitude: lat, longitude: lng, start: d.start, end: d.end }, errors };
}
const sameParams = (a: GetPowerMonthlyParams | null, b: GetPowerMonthlyParams | null) =>
  !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude && a.start === b.start && a.end === b.end;

const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? null : v.toFixed(d));

export default function Dashboard() {
  const [region, setRegion] = useState("global");
  const [indicator, setIndicator] = useState("temperature");
  const [start, setStart] = useState("2015-01-01");
  const [end, setEnd] = useState("2025-12-31");

  const [draft, setDraft] = useState<Draft>({ preset: "kampala", lat: String(PRESETS.kampala.lat), lng: String(PRESETS.kampala.lng), start: "2020-01", end: "2021-12" });
  const [applied, setApplied] = useState<GetPowerMonthlyParams | null>(null);
  const [appliedLabel, setAppliedLabel] = useState<string>("");

  const regions = useGetRegions({ query: { queryKey: getGetRegionsQueryKey() } });
  const indicators = useGetIndicators({ query: { queryKey: getGetIndicatorsQueryKey() } });
  const foundation = useGetFoundation({ query: { queryKey: getGetFoundationQueryKey() } });

  const isTemp = indicator === "temperature";
  const rangeValid = !!start && !!end && start <= end;
  const sParams = { region, indicator, start, end };
  const series = useGetSeries(sParams, { query: { enabled: rangeValid && !isTemp, queryKey: getGetSeriesQueryKey(sParams) } });

  const { params: draftParams, errors } = validate(draft);
  const draftValid = !!draftParams;
  const pending = draftValid && !sameParams(draftParams, applied);
  const powerParams: GetPowerMonthlyParams = applied ?? { latitude: 0, longitude: 0, start: "", end: "" };
  const power = useGetPowerMonthly(powerParams, {
    query: { queryKey: getGetPowerMonthlyQueryKey(powerParams), enabled: !!applied && draftValid, retry: false, staleTime: 30 * 60 * 1000 },
  });
  const showResults = !!applied && draftValid;
  const pd = showResults && !power.isError ? power.data : undefined;

  const reg = regions.data?.find((r) => r.id === region);
  const ind = indicators.data?.find((i) => i.id === indicator);
  const view: View = useMemo(() => (reg ? { lat: reg.latitude, lng: reg.longitude, zoom: reg.zoom, key: reg.id } : { lat: 15, lng: 10, zoom: 2, key: "init" }), [reg]);
  const obs = series.data?.observations ?? [];
  const powerSource = foundation.data?.sources.find((s) => /power/i.test(s.id) || /power/i.test(s.name));

  const draftPoint: Pt | null = Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lng)) && draft.lat.trim() !== "" && draft.lng.trim() !== ""
    ? { lat: Number(draft.lat), lng: Number(draft.lng) } : null;

  const setPreset = (p: PresetId) => {
    if (p === "custom") setDraft((d) => ({ ...d, preset: p }));
    else setDraft((d) => ({ ...d, preset: p, lat: String(PRESETS[p].lat), lng: String(PRESETS[p].lng) }));
  };
  const onMapPoint = (p: Pt | null) => {
    if (!p) { setDraft((d) => ({ ...d, preset: "custom", lat: "", lng: "" })); setApplied(null); return; }
    setDraft((d) => ({ ...d, preset: "custom", lat: p.lat.toFixed(4), lng: p.lng.toFixed(4) }));
  };
  const load = () => {
    if (!draftParams) return;
    setApplied(draftParams);
    setAppliedLabel(draft.preset === "custom" ? "Custom point" : `${PRESETS[draft.preset].name} (single grid point)`);
  };

  const download = (data: PowerSeries) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nasa-power-t2m_${data.latitude}_${data.longitude}_${data.requested_start}_${data.requested_end}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 md:p-5">
      <header className="es-rise flex flex-wrap items-end justify-between gap-3 pb-1">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Research workspace</div>
          <h1 className="font-serif text-2xl md:text-3xl">See the Planet. Detect the Trends.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">This workspace shows NASA POWER monthly 2 m air temperature at a single grid point (not a national average, not a station record); its other indicator tiles remain pending. Multi-source analysis (POWER climate variables, NOAA CO2, World Bank forest cover) with trend methods, comparison and reports lives on the Research desk; satellite imagery and FIRMS fire detections are on the Explorer.</p>
          <Link href="/research" data-testid="link-open-research" className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90">Open the multi-source research desk <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
        {foundation.data && (
          <div data-testid="text-scientific-data" className="rounded-sm border bg-card px-3 py-2 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Scientific data · </span>{foundation.data.scientificData}
          </div>
        )}
      </header>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <Panel label="Point temperature query" right={<span className="font-mono text-[10px] text-muted-foreground">NASA POWER · T2M</span>}>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
              <div>
                <label className={lbl} htmlFor="preset">Point preset</label>
                <select id="preset" data-testid="select-point-preset" className={field} value={draft.preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
                  <option value="kampala">Kampala, Uganda (0.3476, 32.5825)</option>
                  <option value="gulu">Gulu, Uganda (2.7746, 32.2990)</option>
                  <option value="custom">Custom point</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">Presets are single points, not Uganda countrywide values.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl} htmlFor="lat">Latitude</label><input id="lat" data-testid="input-latitude" type="number" step="any" min={-90} max={90} inputMode="decimal" className={field} value={draft.lat} onChange={(e) => setDraft((d) => ({ ...d, preset: "custom", lat: e.target.value }))} /></div>
                <div><label className={lbl} htmlFor="lng">Longitude</label><input id="lng" data-testid="input-longitude" type="number" step="any" min={-180} max={180} inputMode="decimal" className={field} value={draft.lng} onChange={(e) => setDraft((d) => ({ ...d, preset: "custom", lng: e.target.value }))} /></div>
                <div><label className={lbl} htmlFor="pstart">Start month</label><input id="pstart" data-testid="input-start" type="month" min={MIN_MONTH} max={nowMonth()} className={field} value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} /></div>
                <div><label className={lbl} htmlFor="pend">End month</label><input id="pend" data-testid="input-end" type="month" min={MIN_MONTH} max={nowMonth()} className={field} value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} /></div>
              </div>
              {errors.length > 0 && (
                <ul data-testid="text-power-validation" className="space-y-0.5 text-xs text-destructive">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                  <li className="text-muted-foreground">Request paused; previous results hidden.</li>
                </ul>
              )}
              <button type="submit" data-testid="button-load-power" disabled={!draftValid || (power.isFetching && !pending)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Play className="h-3.5 w-3.5" /> Load monthly data
              </button>
              {pending && applied && <p data-testid="text-pending-selection" className="rounded-sm border border-accent/40 bg-accent/10 p-2 text-xs">Edited selection not yet loaded. Results below still describe the applied selection.</p>}
              {!applied && <p className="text-xs text-muted-foreground">Nothing requested yet. Press Load to fetch from NASA POWER; edits and map clicks never fetch on their own.</p>}
            </form>
          </Panel>

          <Panel label="Selection">
            <dl className="space-y-1.5 text-xs">
              <div><dt className={lbl}>Edited (map marker)</dt><dd data-testid="text-point" className="flex items-center gap-1.5 font-mono">{draftPoint ? <><MapPin className="h-3.5 w-3.5 text-accent" />{draftPoint.lat.toFixed(4)}, {draftPoint.lng.toFixed(4)}</> : <span className="text-muted-foreground">none</span>}</dd></div>
              <div><dt className={lbl}>Applied (drives request)</dt><dd data-testid="text-applied-point" className="font-mono">{applied ? `${appliedLabel} · ${applied.latitude}, ${applied.longitude} · ${applied.start} to ${applied.end}` : <span className="text-muted-foreground">none</span>}</dd></div>
            </dl>
          </Panel>

          <Panel label="Other indicators">
            <div className="space-y-3">
              <div>
                <label className={lbl}>Indicator</label>
                {indicators.isLoading ? <div className="space-y-1">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div> : indicators.isError ? (
                  <ErrorPanel title="Indicators unavailable" error={indicators.error} onRetry={() => indicators.refetch()} retrying={indicators.isFetching} />
                ) : (
                  <div className="space-y-1">
                    {indicators.data?.map((i) => (
                      <button key={i.id} data-testid={`button-indicator-${i.id}`} onClick={() => setIndicator(i.id)}
                        className={cn("flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-sm transition-colors", indicator === i.id ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                        <span className="min-w-0"><span className="block truncate">{i.name}</span><span className="font-mono text-[10px] text-muted-foreground">{i.category} · {i.unit}</span></span>
                        <StatusTag status={i.status} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={lbl} htmlFor="region">Map viewport preset</label>
                {regions.isLoading ? <Skeleton className="h-8" /> : regions.isError ? (
                  <ErrorPanel title="Regions unavailable" error={regions.error} onRetry={() => regions.refetch()} retrying={regions.isFetching} />
                ) : (
                  <select id="region" data-testid="select-region" className={field} value={region} onChange={(e) => setRegion(e.target.value)}>
                    {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                {reg && <p className="mt-1 text-xs text-muted-foreground">{reg.description} Viewport only; does not change the point request.</p>}
              </div>
              {!isTemp && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl} htmlFor="start">Start</label><input id="start" data-testid="input-series-start" type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div><label className={lbl} htmlFor="end">End</label><input id="end" data-testid="input-series-end" type="date" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="h-[420px] lg:h-auto lg:min-h-[560px]">
          <EarthMap view={view} point={draftPoint} onPoint={onMapPoint} />
        </div>
      </div>

      <Panel label={`NASA POWER · MERRA-2 reanalysis / modelled estimates · monthly T2M${applied ? ` · ${applied.latitude}, ${applied.longitude}` : ""}`}
        right={<div className="flex items-center gap-2">{pd && <StatusTag status={pd.status} />}{pd && <button data-testid="button-download-power" onClick={() => download(pd)} className="inline-flex items-center gap-1 rounded-sm border bg-card px-2 py-1 text-xs hover:bg-muted"><Download className="h-3 w-3" /> JSON</button>}</div>}>
        <p className="mb-3 text-xs text-muted-foreground">Modelled grid-cell estimates, not observations and not forecasts. Uncertainty is not provided by the source. One point is not a Uganda national average and not a local station.</p>
        {!applied ? (
          <Empty title="No point loaded" body="Choose a preset, enter coordinates or pick on the map, then press Load monthly data." />
        ) : !draftValid ? (
          <Empty title="Invalid selection" body="Fix the highlighted inputs. Earlier results are hidden so they cannot be read under a new label." />
        ) : power.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-[300px]" /></div>
        ) : power.isError ? (
          <ErrorPanel title="NASA POWER request failed (no fallback data shown)" error={power.error} onRetry={() => power.refetch()} retrying={power.isFetching} />
        ) : pd ? (
          pd.status === "no_data" || pd.values.length === 0 ? (
            <><Empty title="No data for this request" body={pd.message} meta={`Requested ${pd.requested_start} to ${pd.requested_end} · ${pd.latitude}, ${pd.longitude}`} /><PowerResult d={pd} /></>
          ) : (
            <PowerResult d={pd} />
          )
        ) : null}
      </Panel>

      {!isTemp && (
        <Panel label={`Time series · ${ind?.name ?? indicator} · ${reg?.name ?? region}`} right={series.data && <StatusTag status={series.data.status} />}>
          {!rangeValid ? (
            <Empty title="Invalid date range" body="Adjust the start and end dates to request a series." />
          ) : series.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-[220px]" /></div>
          ) : series.isError ? (
            <ErrorPanel title="Series request failed" error={series.error} onRetry={() => series.refetch()} retrying={series.isFetching} />
          ) : obs.length > 0 ? (
            <SeriesChart observations={obs} unit={series.data?.unit ?? ""} />
          ) : (
            <Empty title="Pending: no observations returned" body={series.data?.message ?? "No data."} meta={series.data ? `${series.data.region} · ${series.data.indicator} · ${series.data.start} to ${series.data.end} · unit ${series.data.unit}` : undefined} />
          )}
        </Panel>
      )}

      <Panel label="Foundation status" right={<Link href="/sources" data-testid="link-sources" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Integration catalog <ArrowUpRight className="h-3 w-3" /></Link>}>
        {foundation.isLoading ? <div className="grid gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : foundation.isError ? (
          <ErrorPanel title="Foundation status unavailable" error={foundation.error} onRetry={() => foundation.refetch()} retrying={foundation.isFetching} />
        ) : foundation.data && (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[["Phase", foundation.data.phase], ["Backend", foundation.data.backend], ["Database", foundation.data.database], ["Sources listed", `${foundation.data.sources.length}`]].map(([k, v]) => (
                <div key={k} className="rounded-sm border p-2"><div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div><div data-testid={`text-foundation-${k.toLowerCase().replace(/ /g, "-")}`} className="mt-0.5">{v}</div></div>
              ))}
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <div data-testid="text-power-catalog" className="rounded-sm border p-2"><span className={lbl}>NASA POWER in catalog</span>{powerSource ? <span className="flex items-center gap-2"><StatusTag status={powerSource.status} /> adapter listed by backend; not a guarantee of future availability</span> : <span className="text-muted-foreground">not listed</span>}</div>
              <div data-testid="text-power-request-status" className="rounded-sm border p-2"><span className={lbl}>Last point request (this session)</span>{!applied ? "none made" : power.isFetching ? "in progress" : power.isError ? "failed" : pd ? `${pd.status} · retrieved ${pd.retrieved_at ?? "n/a"}` : "not shown (selection invalid)"}</div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function PowerResult({ d }: { d: PowerSeries }) {
  const rows: [string, React.ReactNode][] = [
    ["Coordinates (returned)", `${d.latitude}, ${d.longitude}`],
    ["Requested", `${d.requested_start} to ${d.requested_end}`],
    ["Returned coverage", d.available_start ? `${d.available_start} to ${d.available_end}` : "none"],
    ["Completeness", `${d.valid_months}/${d.expected_months} months · ${d.missing_months} missing · ${d.completeness_percent.toFixed(1)}%`],
    ["Parameter", `${d.parameter} · ${d.parameter_name} · ${d.unit}`],
    ["Kind", d.kind],
    ["Retrieved at", d.retrieved_at ?? "not retrieved"],
    ["Source", d.source],
    ["Source version", d.source_version ?? "not reported"],
    ["Time standard", d.source_time_standard ?? "not reported"],
    ["Attribution", d.attribution],
    ["License", d.license],
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
        {d.status === "ok" && d.values.some(v => v.value !== null)
          ? <PowerChart values={d.values} unit={d.unit} />
          : <p className="text-sm text-muted-foreground">No valid monthly values to chart. Missing months remain gaps.</p>}
        <div className="space-y-2">
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border bg-border">
            {([["Mean", d.mean], ["Min", d.minimum], ["Max", d.maximum]] as const).map(([k, v]) => (
              <div key={k} className="bg-card p-2.5"><dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt><dd data-testid={`stat-power-${k.toLowerCase()}`} className="mt-1 font-mono text-base">{fmt(v) ?? <span className="text-muted-foreground/50">--</span>}</dd></div>
            ))}
          </dl>
          <p className="text-[11px] text-muted-foreground">{d.unit}. Mean weights every valid month equally over the requested window; it is not an annual mean and not a trend. No trend or significance is computed.</p>
          <p data-testid="text-power-message" className="text-[11px]">{d.message}</p>
        </div>
      </div>
      <div className="rounded-sm border border-accent/40 bg-accent/5 p-2 text-xs"><span className="font-medium">Spatial caveat: </span>{d.spatial_caveat} Grid resolution about 0.5° latitude × 0.625° longitude; the value represents that cell, not the exact coordinate.</div>
      <dl data-testid="panel-power-provenance" className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => <div key={k}><dt className={lbl}>{k}</dt><dd className="break-words font-mono">{v}</dd></div>)}
        <div><dt className={lbl}>Links</dt><dd className="flex gap-3"><a href={d.source_url} target="_blank" rel="noreferrer" data-testid="link-power-source" className="text-primary hover:underline">Source request</a><a href={d.documentation_url} target="_blank" rel="noreferrer" data-testid="link-power-docs" className="text-primary hover:underline">Documentation</a></dd></div>
      </dl>
      <details className="rounded-sm border">
        <summary data-testid="toggle-power-table" className="cursor-pointer px-2 py-1.5 text-xs font-medium">Data table ({d.values.length} months)</summary>
        <div className="max-h-72 overflow-auto">
          <table data-testid="table-power" className="w-full font-mono text-xs">
            <caption className="sr-only">Monthly T2M values in {d.unit}</caption>
            <thead className="sticky top-0 bg-card"><tr><th scope="col" className="px-2 py-1 text-left">Month</th><th scope="col" className="px-2 py-1 text-right">Value ({d.unit})</th></tr></thead>
            <tbody>{d.values.map((v) => <tr key={v.month} data-testid={`row-power-${v.month}`} className="border-t"><td className="px-2 py-0.5">{v.month}</td><td className="px-2 py-0.5 text-right">{v.value === null ? <span className="text-muted-foreground">missing</span> : v.value.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Empty({ title, body, meta }: { title: string; body: string; meta?: string }) {
  return (
    <div data-testid="state-empty-series" className="relative flex h-[240px] flex-col items-center justify-center overflow-hidden rounded-sm border border-dashed text-center grid-paper">
      <LineIcon className="h-6 w-6 text-muted-foreground/60" />
      <div className="mt-2 text-sm font-medium">{title}</div>
      <p className="mt-1 max-w-md px-4 text-xs text-muted-foreground">{body}</p>
      {meta && <p className="mt-2 font-mono text-[10px] text-muted-foreground/80">{meta}</p>}
    </div>
  );
}
