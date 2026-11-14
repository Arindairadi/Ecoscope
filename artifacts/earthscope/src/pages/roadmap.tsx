import { getGetFoundationQueryKey, useGetFoundation } from "@workspace/api-client-react";
import { Panel, StatusTag } from "@/components/status";
import { cn } from "@/lib/utils";

const PHASES = [
  { n: 1, title: "Foundation", body: "API service, region and indicator registries, series contract, map workspace and honest status reporting.", status: "complete" },
  { n: 2, title: "Scientific sources", body: "Partial. Working: NASA POWER monthly point variables (T2M, PRECTOTCORR, RH2M, WS2M), NOAA global marine surface CO2, World Bank WDI national forest area, NASA GIBS raster imagery (NDVI, IGBP land cover, aerosol, historical drought hazard), and NASA FIRMS public MODIS 24 h detections. Blocked: FIRMS VIIRS API until an operator sets FIRMS_MAP_KEY; other connectors listed as documented only. Legacy root indicator tiles beyond temperature remain pending.", status: "partial" },
  { n: 3, title: "Validated trends", body: "Partial. Server computes OLS, Sen slope, Mann-Kendall, Pettitt change point, seasonal baselines, anomalies and SPI-3, reporting eligibility and suppressing estimates when data are insufficient. Independent validation against reference studies is not claimed.", status: "partial" },
  { n: 4, title: "Grounded explanations", body: "Partial. Deterministic rule-based interpretation and Q&A restating computed results only. No generative AI.", status: "partial" },
  { n: 5, title: "Exports, comparisons, reporting", body: "Partial. Matched same-source comparisons, CSV/JSON/SVG exports, reproducible research bundle and printable HTML report. Saved selections are local to this browser only; no server or cloud storage.", status: "partial" },
];
const METHOD = [
  ["Provenance first", "Every observation carries source, unit, retrieval time and kind (observation, modelled estimate, forecast, demonstration)."],
  ["No silent fill", "Missing values stay null. Gaps are shown, never interpolated without a stated method."],
  ["Context is not evidence", "The basemap orients the analyst. It is never used as a measurement."],
  ["Claims follow validation", "Trends and explanations appear only once the method behind them is implemented and checked."],
];

export default function Roadmap() {
  const f = useGetFoundation({ query: { queryKey: getGetFoundationQueryKey() } });
  return (
    <div className="mx-auto max-w-[1100px] space-y-3 p-3 md:p-5">
      <header className="es-rise">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Roadmap & methodology</div>
        <h1 className="font-serif text-2xl md:text-3xl">Understand the Change, one validated phase at a time</h1>
        {f.data && <p className="mt-1 text-sm text-muted-foreground">Backend reports: <span data-testid="text-phase" className="font-mono text-foreground">{f.data.phase}</span></p>}
      </header>
      <Panel label="Phases">
        <ol className="relative space-y-4 border-l pl-5">
          {PHASES.map((p) => (
            <li key={p.n} data-testid={`phase-${p.n}`} className="relative">
              <span className={cn("absolute -left-[27px] top-1 flex h-3.5 w-3.5 rounded-full border-2 bg-card", p.status === "complete" ? "border-primary bg-primary" : "border-border")} />
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">P{p.n}</span><span className="font-medium">{p.title}</span><StatusTag status={p.status} /></div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel label="Methodology principles">
        <div className="grid gap-px overflow-hidden rounded-sm border bg-border sm:grid-cols-2">
          {METHOD.map(([t, b]) => <div key={t} className="bg-card p-3"><div className="text-sm font-medium">{t}</div><p className="mt-1 text-xs text-muted-foreground">{b}</p></div>)}
        </div>
      </Panel>
    </div>
  );
}
