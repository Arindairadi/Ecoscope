import { ExternalLink } from "lucide-react";
import { getGetFoundationQueryKey, getGetIndicatorsQueryKey, useGetFoundation, useGetIndicators } from "@workspace/api-client-react";
import { ErrorPanel, Panel, StatusTag } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";

export default function Sources() {
  const f = useGetFoundation({ query: { queryKey: getGetFoundationQueryKey() } });
  const ind = useGetIndicators({ query: { queryKey: getGetIndicatorsQueryKey() } });
  return (
    <div className="mx-auto max-w-[1200px] space-y-3 p-3 md:p-5">
      <header className="es-rise">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Integration catalog</div>
        <h1 className="font-serif text-2xl md:text-3xl">Data sources, as they actually stand</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Status is reported by the backend. Nothing here can be connected from the interface; integrations are implemented and validated server-side in Phase 2.</p>
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
