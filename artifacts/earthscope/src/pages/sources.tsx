import { ExternalLink } from "lucide-react";
import { getGetFoundationQueryKey, getGetIndicatorsQueryKey, getGetResearchConnectorsQueryKey, useGetFoundation, useGetIndicators, useGetResearchConnectors } from "@workspace/api-client-react";
import { ErrorPanel, Panel, StatusTag } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";

export default function Sources() {
  const f = useGetFoundation({ query: { queryKey: getGetFoundationQueryKey() } });
  const con = useGetResearchConnectors({ query: { queryKey: getGetResearchConnectorsQueryKey() } });
  const ind = useGetIndicators({ query: { queryKey: getGetIndicatorsQueryKey() } });
  return (
    <div className="mx-auto max-w-[1200px] space-y-3 p-3 md:p-5">
      <header className="es-rise">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Integration catalog</div>
        <h1 className="font-serif text-2xl md:text-3xl">Data sources, as they actually stand</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Status is reported by the backend; nothing can be connected from the browser. Working research sources (NASA POWER, NOAA CO2, World Bank forest, NASA GIBS imagery, NASA FIRMS public MODIS detections) are listed under Research connectors and used on the Research and Explorer pages. The legacy indicator registry below still lists indicators pending in the original workspace.</p>
      </header>
      <Panel label="Sources" right={f.data && <span className="font-mono text-[10px] text-muted-foreground">{f.data.sources.length} listed</span>}>
        {f.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : f.isError ? (
          <ErrorPanel title="Could not load integration catalog" error={f.error} onRetry={() => f.refetch()} retrying={f.isFetching} />
        ) : f.data?.sources.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">The backend lists no sources yet.</p>
        ) : (
          <div className="divide-y">
            {f.data?.sources.map((s) => (
              <div key={s.id} data-testid={`row-source-${s.id}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-56 sm:shrink-0"><div className="font-medium">{s.name}</div><div className="font-mono text-[10px] text-muted-foreground">{s.id}</div></div>
                <p className="flex-1 text-sm text-muted-foreground">{s.detail}</p>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <StatusTag status={s.status} />
                  {s.url && <a href={s.url} target="_blank" rel="noreferrer" data-testid={`link-source-${s.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Provider docs <ExternalLink className="h-3 w-3" /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel label="Research connectors" right={con.data && <span className="font-mono text-[10px] text-muted-foreground">{con.data.length} reported</span>}>
        <p className="mb-2 text-xs text-muted-foreground">Status comes from server-side configuration checks. "Implemented" means an adapter exists in code; "credentials missing" means it needs secrets set by an operator; "documented only" means no adapter yet. None of this asserts a live cloud connection.</p>
        {con.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : con.isError ? (
          <ErrorPanel title="Could not load research connectors" error={con.error} onRetry={() => con.refetch()} retrying={con.isFetching} />
        ) : !con.data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">No connectors reported.</p> : (
          <div className="divide-y">
            {con.data.map((c) => (
              <div key={c.id} data-testid={`row-connector-${c.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-56 sm:shrink-0"><div className="font-medium">{c.name}</div><div className="font-mono text-[10px] text-muted-foreground">{c.id}</div></div>
                <div className="flex-1 space-y-1.5 text-sm">
                  <p className="text-muted-foreground">{c.detail}</p>
                  {c.setup.length > 0 && <ol className="list-decimal space-y-0.5 pl-4 text-xs">{c.setup.map((st, i) => <li key={i}>{st}</li>)}</ol>}
                  {c.secret_names.length > 0 && <div className="flex flex-wrap gap-1">{c.secret_names.map((n) => <code key={n} className="rounded-sm border bg-muted px-1 font-mono text-[10px]">{n}</code>)}</div>}
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <StatusTag status={c.status} />
                  {/^https?:\/\//.test(c.documentation_url) && <a href={c.documentation_url} target="_blank" rel="noreferrer" data-testid={`link-connector-${c.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Docs <ExternalLink className="h-3 w-3" /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <Panel label="Indicator registry">
          {ind.isLoading ? <Skeleton className="h-32" /> : ind.isError ? <ErrorPanel title="Indicators unavailable" error={ind.error} onRetry={() => ind.refetch()} retrying={ind.isFetching} /> : (
            <ul className="space-y-2">
              {ind.data?.map((i) => (
                <li key={i.id} className="rounded-sm border p-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{i.name}</span><StatusTag status={i.status} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{i.category} · {i.unit}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel label="Backend capabilities">
          {f.isLoading ? <Skeleton className="h-32" /> : f.data && (
            <ul className="space-y-1.5 text-sm">
              {f.data.capabilities.map((c) => <li key={c} className="flex gap-2"><span className="mt-2 h-1 w-3 shrink-0 bg-primary" />{c}</li>)}
            </ul>
          )}
          <div className="mt-4 rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
            Basemap: OpenStreetMap standard tiles via tile.openstreetmap.org, used for geographic context only under the OSM tile usage policy. No bulk download, and never treated as environmental evidence.
          </div>
        </Panel>
      </div>
    </div>
  );
}
