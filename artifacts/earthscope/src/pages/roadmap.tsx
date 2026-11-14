import { getGetFoundationQueryKey, useGetFoundation } from "@workspace/api-client-react";
import { Panel, StatusTag } from "@/components/status";
import { cn } from "@/lib/utils";

const PHASES = [
  { n: 1, title: "Foundation", body: "API service, region and indicator registries, series contract, map workspace and honest status reporting. Backend tests, TypeScript checks and live frontend/API connectivity verified. External scientific integrations remain pending.", status: "complete" },
  { n: 2, title: "Scientific sources", body: "Partial. Implemented: NASA POWER monthly 2 m air temperature (T2M, MERRA-2 based modelled estimate) at a single selected grid point, with provenance, retrieval timestamp, completeness and JSON export. Not yet connected: precipitation, vegetation indices, forest cover, area averages. Verification of this slice is not claimed here.", status: "partial" },
  { n: 3, title: "Validated trends", body: "Trend estimation with uncertainty, significance testing, seasonality handling and documented validation against reference data.", status: "pending" },
  { n: 4, title: "Grounded explanations", body: "Plain-language interpretation that cites the specific observations and methods behind each statement.", status: "pending" },
  { n: 5, title: "Exports, comparisons, reporting", body: "Region and indicator comparisons, reproducible exports and research reports.", status: "pending" },
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
