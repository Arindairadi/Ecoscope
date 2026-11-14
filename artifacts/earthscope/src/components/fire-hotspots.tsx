import { useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip } from "react-leaflet";
import { Download, FileJson, Flame } from "lucide-react";
import { useGetFireDetections, type FireDataset, type FireInput } from "@workspace/api-client-react";
import { ErrorPanel, Panel } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadBlob, safeUrl, toCsv } from "@/lib/research-export";
import { cn } from "@/lib/utils";

const PRESETS = {
  uganda: { label: "Uganda", w: 29, s: -2, e: 36, n: 5 },
  central_africa: { label: "Central Africa", w: 12, s: -12, e: 32, n: 8 },
  brazil: { label: "Brazil (Cerrado / Amazon arc)", w: -60, s: -15, e: -45, n: 0 },
} as const;
type PresetId = keyof typeof PRESETS | "custom";
const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const lbl = "mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-sm border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";

function validate(src: FireInput["source"], b: { w: string; s: string; e: string; n: string }, days: string, date: string): { input: FireInput | null; errors: string[] } {
  const e: string[] = [];
  const [w, s, ea, n] = [b.w, b.s, b.e, b.n].map((x) => (x.trim() === "" ? NaN : Number(x)));
  if (![w, ea].every((x) => Number.isFinite(x) && x >= -180 && x <= 180)) e.push("West/east must be within -180 to 180.");
  if (![s, n].every((x) => Number.isFinite(x) && x >= -90 && x <= 90)) e.push("South/north must be within -90 to 90.");
  if (!e.length) {
    if (w >= ea) e.push("West must be less than east.");
    if (s >= n) e.push("South must be less than north.");
    if (ea - w > 40 || n - s > 40) e.push("Box width and height must each be 40 degrees or less.");
  }
  const d = Number(days);
  if (src === "public_modis") return e.length ? { input: null, errors: e } : { input: { source: src, west: w, south: s, east: ea, north: n, days: 1, date: null }, errors: [] };
  if (!Number.isInteger(d) || d < 1 || d > 5) e.push("Days must be 1 to 5.");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) e.push("Date must be YYYY-MM-DD.");
  return e.length ? { input: null, errors: e } : { input: { source: src, west: w, south: s, east: ea, north: n, days: d, date: date || null }, errors: [] };
}

export function FireHotspots() {
  const [source, setSource] = useState<FireInput["source"]>("public_modis");
  const [preset, setPreset] = useState<PresetId>("uganda");
  const [box, setBox] = useState({ w: "29", s: "-2", e: "36", n: "5" });
  const [days, setDays] = useState("1");
  const [date, setDate] = useState("");
  const [colorFrp, setColorFrp] = useState(true);
  const [density, setDensity] = useState(false);
  const [applied, setApplied] = useState<FireInput | null>(null);
  const [data, setData] = useState<FireDataset | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const reqId = useRef(0);
  const m = useGetFireDetections();
  const mRef = useRef(m.mutateAsync); mRef.current = m.mutateAsync;
  const { input, errors } = useMemo(() => validate(source, box, days, date), [source, box, days, date]);
  const pending = !!applied && JSON.stringify(applied) !== JSON.stringify(input);

  const load = async (i: FireInput) => {
    const id = ++reqId.current;
    setApplied(i); setErr(null); setData(null);
    try { const r = await mRef.current({ data: i }); if (id === reqId.current) setData(r); }
    catch (e) { if (id === reqId.current) setErr(e); }
  };
  const pickPreset = (p: PresetId) => { setPreset(p); if (p !== "custom") { const v = PRESETS[p]; setBox({ w: String(v.w), s: String(v.s), e: String(v.e), n: String(v.n) }); } };
  const setB = (k: keyof typeof box, v: string) => { setPreset("custom"); setBox((b) => ({ ...b, [k]: v })); };

  const frpMax = useMemo(() => Math.max(0, ...(data?.features.map((f) => f.frp_mw ?? 0) ?? [])), [data]);
  const cells = useMemo(() => {
    if (!data || !applied) return { list: [] as { key: string; s: number; w: number; n: number; e: number; count: number }[], max: 0 };
    const m = new Map<string, { key: string; s: number; w: number; n: number; e: number; count: number }>();
    for (const f of data.features) {
      const by = Math.floor(f.latitude), bx = Math.floor(f.longitude), key = `${by}:${bx}`;
      const c = m.get(key);
      if (c) c.count++;
      else m.set(key, { key, s: Math.max(by, applied.south), w: Math.max(bx, applied.west), n: Math.min(by + 1, applied.north), e: Math.min(bx + 1, applied.east), count: 1 });
    }
    const list = [...m.values()];
    return { list, max: list.reduce((a, c) => Math.max(a, c.count), 0) };
  }, [data, applied]);
  const color = (frp: number | null) => {
    if (!colorFrp || frp === null || frpMax <= 0) return "hsl(var(--accent))";
    const t = Math.min(1, frp / frpMax);
    return `hsl(${42 - t * 40} 80% ${58 - t * 18}%)`;
  };
  const slug = applied ? `${applied.source}_${applied.west}_${applied.south}_${applied.east}_${applied.north}` : "fires";
  const exportCsv = (d: FireDataset) => downloadBlob(toCsv([
    ["# source", d.source], ["# source_url", d.source_url], ["# retrieved_at", d.retrieved_at], ["# coverage", `${d.coverage_start ?? ""} to ${d.coverage_end ?? ""}`],
    ["# count_in_bbox", d.count_in_bbox], ["# returned_count", d.returned_count], ["# truncated", String(d.truncated)], ["# attribution", d.attribution],
    ["latitude", "longitude", "acquired_utc", "satellite", "confidence", "frp_mw"],
    ...d.features.map((f) => [f.latitude, f.longitude, f.acquired, f.satellite, f.confidence, f.frp_mw]),
  ]), `ecoscope-fire-detections_${slug}.csv`, "text/csv");
  const center: [number, number] = applied ? [(applied.south + applied.north) / 2, (applied.west + applied.east) / 2] : [1.5, 32.5];
  const srcUrl = data ? safeUrl(data.source_url) : null;

  return (
    <Panel label="Active fire detections · NASA FIRMS" right={<Flame className="h-3.5 w-3.5 text-accent" />}>
      <p className="mb-3 max-w-3xl text-xs text-muted-foreground">Point detections of thermal anomalies from a satellite pass. Each dot is one detection pixel, not a unique fire, not burned area, and not an exhaustive inventory (clouds, overpass timing and smoke hide fires). Nothing is fetched until you press Load.</p>
      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (input) void load(input); }}>
          <div><label className={lbl} htmlFor="f-src">Source</label>
            <select id="f-src" data-testid="select-fire-source" className={field} value={source} onChange={(e) => setSource(e.target.value as FireInput["source"])}>
              <option value="public_modis">MODIS C6.1 public · latest 24 h (no key)</option>
              <option value="firms_viirs">VIIRS via FIRMS API · needs server key</option>
            </select>
            {source === "firms_viirs" && <p className="mt-1 text-[11px] text-muted-foreground">Requires FIRMS_MAP_KEY configured on the server by an operator. Never enter keys here; if absent the server returns a setup message.</p>}
          </div>
          <div><label className={lbl} htmlFor="f-preset">Area preset</label>
            <select id="f-preset" data-testid="select-fire-preset" className={field} value={preset} onChange={(e) => pickPreset(e.target.value as PresetId)}>
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => <option key={k} value={k}>{PRESETS[k].label}</option>)}
              <option value="custom">Custom box</option>
            </select></div>
          <div className="grid grid-cols-2 gap-2">
            {([["w", "West"], ["e", "East"], ["s", "South"], ["n", "North"]] as const).map(([k, l]) => (
              <div key={k}><label className={lbl} htmlFor={`f-${k}`}>{l}</label><input id={`f-${k}`} data-testid={`input-fire-${l.toLowerCase()}`} type="number" step="any" className={field} value={box[k]} onChange={(e) => setB(k, e.target.value)} /></div>
            ))}
          </div>
          {source === "firms_viirs" ? (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl} htmlFor="f-days">Days (1-5)</label><input id="f-days" data-testid="input-fire-days" type="number" min={1} max={5} className={field} value={days} onChange={(e) => setDays(e.target.value)} /></div>
              <div><label className={lbl} htmlFor="f-date">Start date (opt.)</label><input id="f-date" data-testid="input-fire-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
          ) : <p className="text-[11px] text-muted-foreground">Public feed is a rolling latest-24-hour file; days and date are fixed.</p>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" data-testid="checkbox-fire-frp" checked={colorFrp} onChange={(e) => setColorFrp(e.target.checked)} className="accent-[hsl(var(--primary))]" /> Colour by FRP (relative to this load)</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" data-testid="checkbox-fire-density" checked={density} onChange={(e) => setDensity(e.target.checked)} className="accent-[hsl(var(--primary))]" /> Show 1 degree density grid instead of points</label>
          {errors.length > 0 && <ul data-testid="text-fire-validation" className="space-y-0.5 text-xs text-destructive">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
          <button type="submit" data-testid="button-load-fires" disabled={!input || m.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Flame className="h-3.5 w-3.5" /> {m.isPending ? "Loading detections..." : "Load detections"}
          </button>
          {pending && <p className="rounded-sm border border-accent/40 bg-accent/10 p-2 text-xs">Box edited. Map still shows the last loaded box.</p>}
        </form>

        <div data-testid="panel-fire-results" className="min-w-0 space-y-2">
          {!applied && <div className="grid-paper flex h-[360px] items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No detections loaded. Choose an area and press Load.</div>}
          {m.isPending && <Skeleton className="h-[360px]" />}
          {!!err && !m.isPending && applied && <ErrorPanel title="Fire detections request failed" error={err} onRetry={() => void load(applied)} retrying={m.isPending} />}
          {data && applied && !m.isPending && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div data-testid="text-fire-count" className="text-sm"><span className="font-mono text-lg">{data.count_in_bbox}</span> detections in box{data.truncated && <span className="text-accent"> · showing {data.returned_count} (truncated)</span>}</div>
                <div className="flex gap-1.5">
                  <button data-testid="button-export-fires" className={btn} onClick={() => exportCsv(data)}><Download className="h-3 w-3" /> CSV</button>
                  <button data-testid="button-export-fires-json" className={btn} onClick={() => downloadBlob(JSON.stringify({ exported_by: "Ecoscope", exported_at: new Date().toISOString(), request: applied, dataset: data }, null, 2), `ecoscope-fire-detections_${slug}.json`, "application/json")}><FileJson className="h-3 w-3" /> JSON</button>
                </div>
              </div>
              <div data-testid="map-fire-detections" className="overflow-hidden rounded-md border">
                <MapContainer key={slug + data.retrieved_at} center={center} zoom={applied.east - applied.west > 20 ? 4 : 6} minZoom={2} maxZoom={12} className="h-[420px] w-full">
                  <TileLayer className="es-tiles" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxZoom={19} />
                  <Rectangle bounds={[[applied.south, applied.west], [applied.north, applied.east]]} pathOptions={{ color: "hsl(var(--primary))", weight: 1, fill: false, dashArray: "4 4" }} />
                  {density && cells.list.map((c) => (
                    <Rectangle key={c.key} bounds={[[c.s, c.w], [c.n, c.e]]} pathOptions={{ color: "hsl(var(--foreground))", weight: 0.4, fillColor: `hsl(${42 - (c.count / cells.max) * 40} 80% ${58 - (c.count / cells.max) * 18}%)`, fillOpacity: 0.25 + 0.6 * (c.count / cells.max) }}>
                      <Tooltip><div className="font-mono text-[11px]">{c.count} detection{c.count === 1 ? "" : "s"} per 1 degree cell<br />cell lat {Math.floor(c.s)} to {Math.floor(c.s) + 1}, lon {Math.floor(c.w)} to {Math.floor(c.w) + 1}</div></Tooltip>
                    </Rectangle>
                  ))}
                  {!density && data.features.map((f, i) => (
                    <CircleMarker key={i} center={[f.latitude, f.longitude]} radius={4} pathOptions={{ color: "hsl(var(--foreground))", weight: 0.5, fillColor: color(f.frp_mw), fillOpacity: 0.85 }}>
                      <Tooltip><div className="font-mono text-[11px]">{f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}<br />{f.acquired} UTC<br />{f.satellite} · confidence {f.confidence}<br />FRP {f.frp_mw === null ? "not reported" : `${f.frp_mw} MW`}</div></Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
              {data.features.length === 0 && <p data-testid="state-fire-empty" className="text-xs text-muted-foreground">The source reported no detections in this box for this window. That is not proof of no fire.</p>}
              {density && <p data-testid="text-fire-density-caption" className="rounded-sm border border-dashed p-2 text-[11px] text-muted-foreground">Density grid: count of returned detection pixels in fixed 1 degree latitude/longitude bins (floor of lat/lon), cells clipped to the selected box, shaded relative to the busiest cell in this load ({cells.max} detections, {cells.list.length} cells). Aggregates returned detections only{data.truncated ? "; this load is truncated, so counts undercount" : "; truncated loads would undercount"}. 1 degree cells shrink in physical area away from the equator and are not area-normalised. Not fire area, perimeters, probability, unique fires or a comprehensive global map.</p>}
              {!density && colorFrp && frpMax > 0 && <p className="text-[11px] text-muted-foreground">Colour: fire radiative power relative to the max in this load ({frpMax} MW), yellow low to red high. FRP is radiant energy at overpass, not fire size or area.</p>}
              <dl data-testid="panel-fire-provenance" className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {([["Source", data.source], ["Retrieved", data.retrieved_at], ["Coverage (UTC)", `${data.coverage_start ?? "?"} to ${data.coverage_end ?? "?"}`], ["Resolution", data.resolution], ["Attribution", data.attribution]] as const).map(([k, v]) => <div key={k}><dt className={lbl}>{k}</dt><dd className="break-words">{v}</dd></div>)}
                <div><dt className={lbl}>Link</dt><dd>{srcUrl ? <a href={srcUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Source feed</a> : "withheld"}</dd></div>
              </dl>
              {data.warnings.length > 0 && <ul className={cn("space-y-1 rounded-sm border border-accent/40 bg-accent/5 p-2 text-xs")}>{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
