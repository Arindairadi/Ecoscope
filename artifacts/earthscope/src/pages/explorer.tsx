import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { RotateCw } from "lucide-react";
import { getGetSpatialLayersQueryKey, useGetSpatialLayers, type SpatialLayer } from "@workspace/api-client-react";
import { ErrorPanel, Panel } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { safeUrl } from "@/lib/research-export";
import { cn } from "@/lib/utils";
import { FireHotspots } from "@/components/fire-hotspots";

const PRESETS = { uganda: { center: [1.37, 32.29] as [number, number], zoom: 6, label: "Uganda" }, global: { center: [10, 15] as [number, number], zoom: 2, label: "Global" } };
type Cam = { center: [number, number]; zoom: number; src: string; n: number };

const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const lbl = "mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

function dateKind(l: SpatialLayer): "date" | "month" | "year" | "none" {
  const s = l.default_date ?? l.start ?? "";
  if (!l.template.includes("{time}")) return "none";
  return s.length === 4 ? "year" : s.length === 7 ? "month" : "date";
}
function clampDate(v: string, l: SpatialLayer) {
  if (l.start && v < l.start) return l.start;
  if (l.end && v > l.end) return l.end;
  return v;
}

function Sync({ cam, setCam, id }: { cam: Cam; setCam: (c: Cam) => void; id: string }) {
  const map = useMap();
  useEffect(() => {
    if (cam.src === id) return;
    map.setView(cam.center, cam.zoom, { animate: cam.src === "preset" });
  }, [cam, id, map]);
  useEffect(() => {
    const h = () => { const c = map.getCenter(); setCam({ center: [c.lat, c.lng], zoom: map.getZoom(), src: id, n: Date.now() }); };
    map.on("moveend", h);
    return () => { map.off("moveend", h); };
  }, [map, id, setCam]);
  return null;
}

function ImageryMap({ layer, date, opacity, cam, setCam, id, label }: { layer: SpatialLayer; date: string; opacity: number; cam: Cam; setCam: (c: Cam) => void; id: string; label: string }) {
  const [stats, setStats] = useState({ loading: 0, loaded: 0, errors: 0 });
  const [retry, setRetry] = useState(0);
  const url = layer.template.replace("{time}", encodeURIComponent(date));
  useEffect(() => { setStats({ loading: 0, loaded: 0, errors: 0 }); }, [url, retry]);
  const busy = stats.loading > 0;
  return (
    <div className="relative overflow-hidden rounded-md border" data-testid={`map-explorer-${id}`}>
      <div className="absolute left-2 top-2 z-[500] rounded-sm border bg-card/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur">{label} · {date || "no date"}</div>
      <div className="absolute bottom-6 left-2 z-[500] flex items-center gap-2 rounded-sm border bg-card/90 px-2 py-1 font-mono text-[10px] backdrop-blur" data-testid={`text-tile-status-${id}`}>
        <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "animate-pulse bg-accent" : stats.errors ? "bg-destructive" : "bg-primary")} />
        {busy ? `loading ${stats.loading}` : "idle"} · {stats.loaded} ok · {stats.errors} failed
        {stats.errors > 0 && <button data-testid={`button-retry-tiles-${id}`} onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 text-primary hover:underline"><RotateCw className="h-3 w-3" /> retry</button>}
      </div>
      <MapContainer center={cam.center} zoom={cam.zoom} minZoom={1} maxZoom={Math.max(layer.max_zoom + 3, 8)} worldCopyJump className="h-[420px] w-full md:h-[520px]">
        <Sync cam={cam} setCam={setCam} id={id} />
        <TileLayer className="es-tiles" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
        <TileLayer key={`${url}-${retry}`} url={url} opacity={opacity} maxNativeZoom={layer.max_zoom} maxZoom={19} attribution={layer.attribution}
          eventHandlers={{
            tileloadstart: () => setStats((s) => ({ ...s, loading: s.loading + 1 })),
            tileload: () => setStats((s) => ({ ...s, loading: Math.max(0, s.loading - 1), loaded: s.loaded + 1 })),
            tileerror: () => setStats((s) => ({ ...s, loading: Math.max(0, s.loading - 1), errors: s.errors + 1 })),
          }} />
      </MapContainer>
    </div>
  );
}

function DateInput({ layer, value, onChange, testid, label }: { layer: SpatialLayer; value: string; onChange: (v: string) => void; testid: string; label: string }) {
  const k = dateKind(layer);
  if (k === "none") return <p className="text-xs text-muted-foreground">This layer is not time-enabled.</p>;
  const lo = layer.start ?? undefined, hi = layer.end ?? undefined;
  return (
    <div>
      <label className={lbl} htmlFor={testid}>{label}</label>
      {k === "year" ? (
        <input id={testid} data-testid={testid} type="number" min={lo} max={hi} className={field} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(clampDate(value, layer))} />
      ) : (
        <input id={testid} data-testid={testid} type={k} min={lo?.slice(0, k === "month" ? 7 : 10)} max={hi?.slice(0, k === "month" ? 7 : 10)} className={field} value={value} onChange={(e) => e.target.value && onChange(clampDate(e.target.value, layer))} />
      )}
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">available {lo ?? "?"} to {hi ?? "?"}</p>
    </div>
  );
}

export default function Explorer() {
  const q = useGetSpatialLayers({ query: { queryKey: getGetSpatialLayersQueryKey() } });
  const layers = useMemo(() => q.data?.layers ?? [], [q.data]);
  const [layerId, setLayerId] = useState("");
  const layer = layers.find((l) => l.id === layerId) ?? layers[0];
  const [dateA, setDateA] = useState("");
  const [dateB, setDateB] = useState("");
  const [compare, setCompare] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [cam, setCam] = useState<Cam>({ ...PRESETS.uganda, src: "preset", n: 0 });

  useEffect(() => {
    if (!layer) return;
    const d = layer.default_date ?? layer.end ?? layer.start ?? "";
    setDateA(d); setDateB(layer.start && layer.start !== d ? layer.start : d);
  }, [layer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = layer ? safeUrl(layer.documentation_url) : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 p-3 md:p-5">
      <header className="es-rise">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Imagery explorer · NASA GIBS</div>
        <h1 className="font-serif text-2xl md:text-3xl">Look, then go measure.</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Rendered satellite imagery for visual context. Colours are a qualitative rendering, not numeric pixel measurements, not a complete fire inventory, and not a forest-loss calculation. Ecoscope never derives trends from tile colours; use the Research desk for measured series. Raster layers here do not show fires; fire detections are loaded as real points below.</p>
      </header>

      {q.isLoading ? <div className="grid gap-3 lg:grid-cols-[300px_1fr]"><Skeleton className="h-80" /><Skeleton className="h-[520px]" /></div>
        : q.isError ? <ErrorPanel title="Layer catalog unavailable" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
        : !layer ? <div className="grid-paper rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="state-no-layers">The server returned no imagery layers. Nothing is shown rather than an invented layer.</div>
        : (
          <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
            <div className="space-y-3">
              <Panel label="Layer" right={<span className="font-mono text-[10px] text-muted-foreground">{layers.length} live</span>}>
                <div className="space-y-3">
                  <div><label className={lbl} htmlFor="x-layer">Imagery layer</label>
                    <select id="x-layer" data-testid="select-explorer-layer" className={field} value={layer.id} onChange={(e) => setLayerId(e.target.value)}>
                      {layers.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select></div>
                  <DateInput layer={layer} value={dateA} onChange={setDateA} testid="input-explorer-date" label={compare ? "Date A" : "Date"} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="checkbox-explorer-compare" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[hsl(var(--primary))]" /> Side-by-side date comparison</label>
                  {compare && <DateInput layer={layer} value={dateB} onChange={setDateB} testid="input-explorer-date-b" label="Date B" />}
                  <div><label className={lbl} htmlFor="x-op">Opacity {Math.round(opacity * 100)}%</label>
                    <input id="x-op" data-testid="input-explorer-opacity" type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" /></div>
                  <div><span className={lbl}>View</span>
                    <div className="flex gap-2">{(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
                      <button key={k} data-testid={`button-view-${k}`} onClick={() => setCam({ center: PRESETS[k].center, zoom: PRESETS[k].zoom, src: "preset", n: Date.now() })} className="flex-1 rounded-sm border bg-card px-2 py-1.5 text-xs hover:bg-muted">{PRESETS[k].label}</button>
                    ))}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Pan and zoom to drill into a country. This is a map view, not a country aggregation.</p>
                  </div>
                </div>
              </Panel>
              <Panel label="Layer metadata">
                <dl className="space-y-2 text-xs" data-testid="panel-layer-metadata">
                  <div><dt className={lbl}>Identifier</dt><dd className="break-all font-mono">{layer.id}</dd></div>
                  <div><dt className={lbl}>Native max zoom</dt><dd className="font-mono">{layer.max_zoom} (tiles upscaled beyond this)</dd></div>
                  {layer.legend && <div><dt className={lbl}>Legend</dt><dd>{safeUrl(layer.legend) ? <a href={safeUrl(layer.legend)!} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open legend</a> : layer.legend}</dd></div>}
                  <div><dt className={lbl}>Caveat</dt><dd data-testid="text-layer-caveat" className="rounded-sm border border-accent/40 bg-accent/5 p-2">{layer.caveat}</dd></div>
                  <div><dt className={lbl}>Attribution</dt><dd>{layer.attribution}</dd></div>
                  {doc && <div><a href={doc} target="_blank" rel="noreferrer" data-testid="link-layer-docs" className="text-primary hover:underline">Layer documentation</a></div>}
                  <div className="font-mono text-[10px] text-muted-foreground">Catalog retrieved {q.data?.retrieved_at}</div>
                </dl>
              </Panel>
            </div>
            <div className={cn("grid gap-3", compare && "xl:grid-cols-2")}>
              <ImageryMap id="a" label={compare ? "A" : layer.title} layer={layer} date={dateA} opacity={opacity} cam={cam} setCam={setCam} />
              {compare && <ImageryMap id="b" label="B" layer={layer} date={dateB} opacity={opacity} cam={cam} setCam={setCam} />}
              <p className="text-[11px] text-muted-foreground xl:col-span-2">Blank or failed tiles usually mean no acquisition for that date or region (clouds, orbit gaps, polar night). Counts above each map are live tile requests, not data values.</p>
            </div>
          </div>
        )}
      <FireHotspots />
    </div>
  );
}
