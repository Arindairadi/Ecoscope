import { useEffect, useState } from "react";

export type Country = { iso3: string; name: string; latitude: number; longitude: number; admin1_count: number };
export type Region = { id: string; name: string; type: string; latitude: number; longitude: number };
export type PlacePick = { iso3: string; latitude: number; longitude: number; label: string };

let countriesCache: Promise<Country[]> | null = null;
export function loadCountries(): Promise<Country[]> {
  countriesCache ??= fetch("/api/places/countries")
    .then((r) => { if (!r.ok) throw new Error(`Countries unavailable (${r.status})`); return r.json(); })
    .then((j) => j.countries as Country[])
    .catch((e) => { countriesCache = null; throw e; });
  return countriesCache;
}

const regionCache = new Map<string, Promise<Region[]>>();
function loadRegions(iso3: string): Promise<Region[]> {
  let p = regionCache.get(iso3);
  if (!p) {
    p = fetch(`/api/places/countries/${iso3}/admin1`)
      .then((r) => { if (!r.ok) throw new Error(`Regions unavailable (${r.status})`); return r.json(); })
      .then((fc) => (fc.features as { properties: Region }[]).map((f) => f.properties))
      .catch((e) => { regionCache.delete(iso3); throw e; });
    regionCache.set(iso3, p);
  }
  return p;
}

export function useCountries() {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; loadCountries().then((c) => live && setCountries(c)).catch(() => live && setFailed(true)); return () => { live = false; }; }, []);
  return { countries, failed };
}

export function PlacePicker({ iso, onPick, fieldClass, labelClass }: { iso: string; onPick: (p: PlacePick) => void; fieldClass: string; labelClass: string }) {
  const { countries, failed } = useCountries();
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [regionError, setRegionError] = useState(false);
  const [regionId, setRegionId] = useState("");
  const country = countries?.find((c) => c.iso3 === iso);

  useEffect(() => {
    setRegionId(""); setRegions(null); setRegionError(false);
    if (!country || country.admin1_count === 0) return;
    let live = true;
    loadRegions(country.iso3).then((r) => live && setRegions(r)).catch(() => live && setRegionError(true));
    return () => { live = false; };
  }, [country?.iso3]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <p className="text-[11px] text-muted-foreground">Country list unavailable; enter coordinates below.</p>;
  if (!countries) return <p className="text-[11px] text-muted-foreground">Loading countries…</p>;
  return (
    <div className="space-y-2" data-testid="place-picker">
      <div>
        <label className={labelClass} htmlFor="pp-country">Country</label>
        <select id="pp-country" data-testid="select-place-country" className={fieldClass} value={country ? country.iso3 : ""}
          onChange={(e) => { const c = countries.find((x) => x.iso3 === e.target.value); if (c) onPick({ iso3: c.iso3, latitude: c.latitude, longitude: c.longitude, label: c.name }); }}>
          {!country && <option value="">Select a country…</option>}
          {countries.map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
        </select>
      </div>
      {country && country.admin1_count > 0 && (
        <div>
          <label className={labelClass} htmlFor="pp-region">Region / district <span className="text-muted-foreground">({country.admin1_count})</span></label>
          <select id="pp-region" data-testid="select-place-region" className={fieldClass} value={regionId} disabled={!regions}
            onChange={(e) => { const r = regions?.find((x) => x.id === e.target.value); setRegionId(e.target.value); if (r && country) onPick({ iso3: country.iso3, latitude: r.latitude, longitude: r.longitude, label: `${r.name}, ${country.name}` }); }}>
            <option value="">{regionError ? "Regions unavailable" : regions ? "Whole country (centre point)" : "Loading…"}</option>
            {regions?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.type ? ` (${r.type})` : ""}</option>)}
          </select>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Picking a place sets the coordinates to a point inside it. The result is for that point, not an average over the region. Boundaries: Natural Earth, simplified.</p>
    </div>
  );
}
