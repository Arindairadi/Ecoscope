import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, LineChart as LineIcon, MapPin } from "lucide-react";
import {
  getGetFoundationQueryKey, getGetIndicatorsQueryKey, getGetRegionsQueryKey, getGetSeriesQueryKey,
  useGetFoundation, useGetIndicators, useGetRegions, useGetSeries,
} from "@workspace/api-client-react";
import { EarthMap, type Pt, type View } from "@/components/earth-map";
import { SeriesChart } from "@/components/series-chart";
import { ErrorPanel, Panel, StatusTag } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";
const lbl = "mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground";

export default function Dashboard() {
  const [region, setRegion] = useState("global");
  const [indicator, setIndicator] = useState("temperature");
  const [start, setStart] = useState("2015-01-01");
  const [end, setEnd] = useState("2025-12-31");
  const [point, setPoint] = useState<Pt | null>(null);

  const regions = useGetRegions({ query: { queryKey: getGetRegionsQueryKey() } });
  const indicators = useGetIndicators({ query: { queryKey: getGetIndicatorsQueryKey() } });
  const foundation = useGetFoundation({ query: { queryKey: getGetFoundationQueryKey() } });

  const rangeValid = !!start && !!end && start <= end;
  const params = { region, indicator, start, end };
  const series = useGetSeries(params, { query: { enabled: rangeValid, queryKey: getGetSeriesQueryKey(params) } });

  const reg = regions.data?.find((r) => r.id === region);
  const ind = indicators.data?.find((i) => i.id === indicator);
  const view: View = useMemo(() => (reg ? { lat: reg.latitude, lng: reg.longitude, zoom: reg.zoom, key: reg.id } : { lat: 15, lng: 10, zoom: 2, key: "init" }), [reg]);
  const obs = series.data?.observations ?? [];
  const numeric = obs.map((o) => o.value).filter((v): v is number => v !== null);
  const stats = numeric.length
    ? { n: numeric.length, min: Math.min(...numeric), max: Math.max(...numeric), mean: numeric.reduce((a, b) => a + b, 0) / numeric.length }
    : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 md:p-5">
      <header className="es-rise flex flex-wrap items-end justify-between gap-3 pb-1">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Research workspace</div>
          <h1 className="font-serif text-2xl md:text-3xl">See the Planet. Detect the Trends.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Phase 1 foundation. Controls, map context and the series pipeline are wired to the API; no scientific observation sources are connected yet, so charts and statistics stay empty until they are.</p>
        </div>
        {foundation.data && (
          <div data-testid="text-scientific-data" className="rounded-sm border bg-card px-3 py-2 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Scientific data · </span>{foundation.data.scientificData}
          </div>
        )}
      </header>

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <Panel label="Query parameters">
            <div className="space-y-3">
              <div>
                <label className={lbl} htmlFor="region">Geographic preset</label>
                {regions.isLoading ? <Skeleton className="h-8" /> : regions.isError ? (
                  <ErrorPanel title="Regions unavailable" error={regions.error} onRetry={() => regions.refetch()} retrying={regions.isFetching} />
                ) : (
                  <select id="region" data-testid="select-region" className={field} value={region} onChange={(e) => setRegion(e.target.value)}>
                    {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                {reg && <p className="mt-1 text-xs text-muted-foreground">{reg.description}</p>}
              </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl} htmlFor="start">Start</label><input id="start" data-testid="input-start" type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div><label className={lbl} htmlFor="end">End</label><input id="end" data-testid="input-end" type="date" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
              {!rangeValid && <p data-testid="text-range-error" className="text-xs text-destructive">Start date must be on or before end date. Series request paused.</p>}
            </div>
          </Panel>

          <Panel label="Selected point">
            {point ? (
              <div data-testid="text-point" className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 font-mono"><MapPin className="h-3.5 w-3.5 text-accent" />{point.lat.toFixed(4)}, {point.lng.toFixed(4)}</div>
                <p className="text-xs text-muted-foreground">Visual selection only. Scientific point retrieval is pending (Phase 2); series requests still use the "{reg?.name ?? region}" preset.</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Use "Select point" on the map to mark a location of interest. Point-level retrieval is not implemented yet.</p>
            )}
          </Panel>
        </div>

        <div className="h-[420px] lg:h-auto lg:min-h-[520px]">
          <EarthMap view={view} point={point} onPoint={setPoint} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
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
            <Empty title="No observations returned" body={series.data?.message ?? "No data."} meta={series.data ? `${series.data.region} · ${series.data.indicator} · ${series.data.start} to ${series.data.end} · unit ${series.data.unit}` : undefined} />
          )}
        </Panel>

        <Panel label="Summary statistics">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border">
            {[["Observations", stats ? String(stats.n) : null], ["Mean", stats ? stats.mean.toFixed(3) : null], ["Min", stats ? stats.min.toFixed(3) : null], ["Max", stats ? stats.max.toFixed(3) : null], ["Trend", null], ["Significance", null]].map(([k, v]) => (
              <div key={k} className="bg-card p-2.5">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                <dd data-testid={`stat-${String(k).toLowerCase()}`} className="mt-1 font-mono text-lg">{v ?? <span className="text-muted-foreground/50">--</span>}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Values compute only from returned observations. Trend detection and significance testing arrive in Phase 3.</p>
        </Panel>
      </div>

      <Panel label="Foundation status" right={<Link href="/sources" data-testid="link-sources" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Integration catalog <ArrowUpRight className="h-3 w-3" /></Link>}>
        {foundation.isLoading ? <div className="grid gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : foundation.isError ? (
          <ErrorPanel title="Foundation status unavailable" error={foundation.error} onRetry={() => foundation.refetch()} retrying={foundation.isFetching} />
        ) : foundation.data && (
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[["Phase", foundation.data.phase], ["Backend", foundation.data.backend], ["Database", foundation.data.database], ["Sources listed", `${foundation.data.sources.length}`]].map(([k, v]) => (
              <div key={k} className="rounded-sm border p-2"><div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div><div data-testid={`text-foundation-${k.toLowerCase().replace(/ /g, "-")}`} className="mt-0.5">{v}</div></div>
            ))}
          </div>
        )}
      </Panel>
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
