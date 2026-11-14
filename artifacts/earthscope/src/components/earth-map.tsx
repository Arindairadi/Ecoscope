import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Layers, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type View = { lat: number; lng: number; zoom: number; key: string };
export type Pt = { lat: number; lng: number };
export const wrapLng = (lng: number) => { const w = ((((lng + 180) % 360) + 360) % 360) - 180; return w === -180 && lng > 0 ? 180 : w; };

function Fly({ view }: { view: View }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([view.lat, view.lng], view.zoom, { duration: 0.9 });
  }, [view.key, view.lat, view.lng, view.zoom, map]);
  return null;
}
function Picker({ on, onPick, onMove }: { on: boolean; onPick: (p: Pt) => void; onMove: (p: Pt | null) => void }) {
  useMapEvents({
    click: (e) => { if (on) onPick({ lat: Math.max(-90, Math.min(90, e.latlng.lat)), lng: wrapLng(e.latlng.lng) }); },
    mousemove: (e) => onMove({ lat: e.latlng.lat, lng: e.latlng.lng }),
    mouseout: () => onMove(null),
  });
  return null;
}

export function EarthMap({ view, point, onPoint }: { view: View; point: Pt | null; onPoint: (p: Pt | null) => void }) {
  const [basemap, setBasemap] = useState(true);
  const [picking, setPicking] = useState(false);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [tiles, setTiles] = useState<{ loading: boolean; errors: number; loaded: number }>({ loading: true, errors: 0, loaded: 0 });

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-md border grid-paper">
      <MapContainer center={[view.lat, view.lng]} zoom={view.zoom} minZoom={2} worldCopyJump maxBounds={[[-90, -540], [90, 540]]} maxBoundsViscosity={1} zoomControl={false} className={cn("h-full w-full", picking && "cursor-crosshair")} style={{ background: "transparent" }}>
        <ZoomControl position="bottomright" />
        {basemap && (
          <TileLayer
            className="es-tiles"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
            eventHandlers={{
              loading: () => setTiles((t) => ({ ...t, loading: true })),
              load: () => setTiles((t) => ({ ...t, loading: false })),
              tileload: () => setTiles((t) => ({ ...t, loaded: t.loaded + 1 })),
              tileerror: () => setTiles((t) => ({ ...t, errors: t.errors + 1 })),
            }}
          />
        )}
        <Fly view={view} />
        <Picker on={picking} onPick={(p) => { onPoint(p); setPicking(false); }} onMove={setCursor} />
        {point && <CircleMarker center={[point.lat, point.lng]} radius={7} pathOptions={{ color: "hsl(18 68% 52%)", weight: 2, fillOpacity: 0.35 }} />}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex gap-1 rounded-sm border bg-card/95 p-1 shadow-sm backdrop-blur">
          <button data-testid="button-toggle-basemap" onClick={() => { setBasemap((b) => !b); setTiles({ loading: !basemap, errors: 0, loaded: 0 }); }} className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs", basemap ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <Layers className="h-3.5 w-3.5" /> OSM basemap {basemap ? "on" : "off"}
          </button>
          <button data-testid="button-pick-point" onClick={() => setPicking((p) => !p)} className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs", picking ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
            <Crosshair className="h-3.5 w-3.5" /> {picking ? "Click map to place" : "Select point"}
          </button>
          {point && <button data-testid="button-clear-point" onClick={() => onPoint(null)} className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Clear</button>}
        </div>
        {basemap && (
          <div data-testid="status-tiles" className="pointer-events-auto rounded-sm border bg-card/95 px-2 py-1 font-mono text-[10px] shadow-sm backdrop-blur">
            {tiles.errors > 0 ? (
              <span className="flex items-center gap-1.5 text-destructive"><TriangleAlert className="h-3 w-3" /> {tiles.errors} tile{tiles.errors > 1 ? "s" : ""} failed to load</span>
            ) : tiles.loading ? (
              <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading tiles</span>
            ) : (
              <span className="text-muted-foreground">Tiles loaded · {tiles.loaded}</span>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-6 left-2 right-12 z-[500] w-fit max-w-[calc(100%-4rem)] rounded-sm border bg-card/95 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm">
        {cursor ? `${cursor.lat.toFixed(3)}, ${wrapLng(cursor.lng).toFixed(3)}` : "lat, lon"} · Basemap is context only, not environmental evidence
      </div>
    </div>
  );
}
