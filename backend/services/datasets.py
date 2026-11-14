"""Genuine public series with explicitly different geographic/temporal support."""
import csv
from datetime import date
import hashlib
import io
import json
import math
import pycountry
from urllib.parse import urlencode
from backend.research_models import ResearchDataset, ResearchSelection, ResearchValue
from backend.services.power import PowerError, ENDPOINT, ATTRIBUTION, SPATIAL_CAVEAT, DOCS
from backend.services.upstream import public_upstream

POWER_PARAMETERS = {
    "T2M": ("C", "°C", "Temperature at 2 Meters"),
    "PRECTOTCORR": ("mm/day", "mm/day", "Precipitation Corrected"),
    "RH2M": ("%", "%", "Relative Humidity at 2 Meters"),
    "WS2M": ("m/s", "m/s", "Wind Speed at 2 Meters"),
}
NOAA_URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_gl.csv"
FOREST_DOC = "https://data.worldbank.org/indicator/AG.LND.FRST.ZS"


def periods(s: ResearchSelection, annual=False):
    first = int(s.start[:4])*12 + int(s.start[5:])-1
    last = int(s.end[:4])*12 + int(s.end[5:])-1
    if s.start > s.end or last-first > 599:
        raise ValueError("Use an ordered range of at most 600 months (50 years).")
    if s.end > date.today().strftime("%Y-%m"):
        raise ValueError("Future periods are unsupported. These are not forecasts.")
    minimum = {"power": "1981-01", "noaa": "1979-01", "worldbank": "1990-01"}[s.source]
    if s.start < minimum:
        raise ValueError(f"This source selection must start on or after {minimum}.")
    if annual:
        # Do not pretend partial-year selection is an annual national estimate.
        if s.start[5:] != "01" or s.end[5:] != "12":
            raise ValueError("Annual forest data requires January–December year boundaries.")
        return [str(y) for y in range(int(s.start[:4]), int(s.end[:4])+1)]
    return [f"{n//12:04d}-{n%12+1:02d}" for n in range(first,last+1)]


def numeric(value, fill=None):
    if value is None or value == fill:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PowerError("Source returned a nonnumeric value.")
    return float(value) if math.isfinite(value) else None


def assembled(s, values, *, label, source, source_url, docs, unit, kind,
              scope, resolution, location, attribution, license, retrieved, warnings, annual=False):
    good = [v for v in values if v.value is not None]
    encoded = json.dumps({"selection": s.model_dump(), "values": [v.model_dump() for v in values]},
                         sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return ResearchDataset(
        id=f"{s.source}:{s.indicator}", label=label, source=source, source_url=source_url,
        documentation_url=docs, license=license, attribution=attribution, retrieved_at=retrieved,
        kind=kind, unit=unit, frequency="annual" if annual else "monthly", spatial_scope=scope,
        resolution=resolution, location=location, requested_start=s.start, requested_end=s.end,
        available_start=good[0].period if good else None, available_end=good[-1].period if good else None,
        coverage_percent=100*len(good)/len(values), expected_count=len(values), valid_count=len(good),
        warnings=warnings, values=values, fingerprint=hashlib.sha256(encoded).hexdigest(), selection=s,
    )


async def get_dataset(selection: ResearchSelection) -> ResearchDataset:
    s = selection.model_copy(deep=True)
    s.latitude, s.longitude = round(s.latitude,4), round(s.longitude,4)
    if s.source == "power":
        if s.indicator not in POWER_PARAMETERS:
            raise ValueError("NASA POWER supports only the listed meteorological parameters.")
        slots = periods(s)
        native, unit, label = POWER_PARAMETERS[s.indicator]
        last_year = min(int(s.end[:4]), date.today().year-1)
        url, retrieved, raw, header = DOCS, None, {}, {}
        if last_year >= int(s.start[:4]):
            url = ENDPOINT + "?" + urlencode(dict(parameters=s.indicator, community="AG", latitude=s.latitude,
                         longitude=s.longitude, start=s.start[:4], end=last_year, format="JSON"))
            body, retrieved = await public_upstream.get(url)
            try:
                data=json.loads(body); header=data["header"]; meta=data["parameters"][s.indicator]
                if meta["units"] != native or meta["longname"] != label:
                    raise ValueError("parameter metadata changed")
                if "MERRA2" not in header["sources"] or not set(header["sources"]) <= {"MERRA2","POWER"}:
                    raise ValueError("unexpected meteorological provenance")
                raw=data["properties"]["parameter"][s.indicator]
                if not isinstance(raw,dict) or not math.isfinite(float(header["fill_value"])):
                    raise ValueError("invalid fill metadata")
            except (KeyError, ValueError, TypeError) as e:
                raise PowerError("NASA monthly metadata or response changed; no guessed conversion.") from e
        values=[ResearchValue(period=m,value=numeric(raw.get(m.replace("-","")), header.get("fill_value",-999))) for m in slots]
        warnings=[SPATIAL_CAVEAT, "Only completed NASA source years are requested. Missing data remain gaps; annual YYYY13 entries are excluded.",
                  "Monthly rates are averaged equally; rainfall in mm/day is not monthly accumulated rainfall."]
        if header:
            warnings.append(f"Source version {header.get('api',{}).get('version','unspecified')}; source time standard {header.get('time_standard','unspecified')}; source components {', '.join(header['sources'])}.")
        return assembled(s,values,label=label,source="NASA POWER / MERRA-2 meteorology",source_url=url,
            docs=DOCS,unit=unit,kind="modelled_estimate",scope="point_grid",resolution="0.5° latitude × 0.625° longitude",
            location=f"Point {s.latitude}, {s.longitude}",attribution=ATTRIBUTION,license="CC BY 4.0 (NASA POWER)",
            retrieved=retrieved,warnings=warnings)
    if s.source == "noaa":
        if s.indicator != "co2":
            raise ValueError("NOAA connector supports global marine-surface CO₂ only.")
        slots=periods(s);body,retrieved=await public_upstream.get(NOAA_URL)
        try:
            reader=csv.DictReader(line for line in body.decode().splitlines() if line and not line.startswith("#"))
            raw={}
            for row in reader:
                m=f"{int(row['year']):04d}-{int(row['month']):02d}"
                v=float(row["average"]);u=float(row["average_unc"])
                if m in raw: raise ValueError("duplicate month")
                raw[m]=(None if v<0 or not math.isfinite(v) else v,None if u<0 or not math.isfinite(u) else u)
            if not raw: raise ValueError("no rows")
        except (KeyError,ValueError,UnicodeError) as e:
            raise PowerError("NOAA CSV schema changed or could not be parsed.") from e
        values=[ResearchValue(period=m,value=raw.get(m,(None,None))[0],uncertainty=raw.get(m,(None,None))[1]) for m in slots]
        return assembled(s,values,label="Global marine-surface CO₂ monthly mean",source="NOAA Global Monitoring Laboratory",
            source_url=NOAA_URL,docs="https://gml.noaa.gov/ccgg/trends/gl_data.html",unit="ppm",kind="observation_derived_global_product",
            scope="global_marine_surface",resolution="Globally averaged marine-surface monitoring network; not a satellite raster",
            location="Global marine surface (coordinates are not used)",attribution="Lan, X., Tans, P. and K.W. Thoning: Trends in globally-averaged CO₂ determined from NOAA GML measurements. https://doi.org/10.15138/9N0H-ZH07",
            license="NOAA public-domain government data; acknowledge NOAA GML; no endorsement.",retrieved=retrieved,
            warnings=["Observation-derived global product, not a point measurement, local air quality measure, gridded global map or forecast.",
                      "Source uncertainty is the reported Monte Carlo monthly mean uncertainty in ppm, not a confidence band for our trend. Recent and historical data may be revised."])
    if s.indicator != "forest":
        raise ValueError("World Bank connector supports annual national forest-area percentage only.")
    if pycountry.countries.get(alpha_3=s.country) is None:
        raise ValueError("Select a real ISO3166 alpha-3 country; regional aggregates are not national series.")
    slots=periods(s,annual=True)
    url=f"https://api.worldbank.org/v2/country/{s.country}/indicator/AG.LND.FRST.ZS?" + urlencode(dict(format="json",date=f"{s.start[:4]}:{s.end[:4]}",per_page=100))
    body,retrieved=await public_upstream.get(url)
    try:
        data=json.loads(body)
        if not isinstance(data,list) or len(data)!=2 or not isinstance(data[0],dict) or int(data[0].get("pages",0))>1:
            raise ValueError("unexpected World Bank pagination")
        rows=data[1] or []
        if not rows:
            raise ValueError("No such supported country or indicator.")
        if any(r["indicator"]["id"]!="AG.LND.FRST.ZS" or r["countryiso3code"]!=s.country for r in rows):
            raise ValueError("country/indicator mismatch")
        raw={r["date"]:r["value"] for r in rows}
        name=rows[0]["country"]["value"]
    except (KeyError,ValueError,TypeError) as e:
        raise PowerError("World Bank response unavailable, empty or inconsistent with the selected country.") from e
    values=[ResearchValue(period=y,value=numeric(raw.get(y))) for y in slots]
    return assembled(s,values,label="Forest area (% of land area)",source="World Bank WDI / FAO",
        source_url=url,docs=FOREST_DOC,unit="% land area",kind="national_statistical_estimate",
        scope="national",resolution="Annual national statistics; no subnational spatial detail",location=f"{name} ({s.country})",
        attribution="World Bank World Development Indicators, AG.LND.FRST.ZS; FAO. Cite source and retrieval date.",
        license="CC BY 4.0 via World Bank Open Data, subject to dataset terms.",retrieved=retrieved,annual=True,
        warnings=["Forest-area stock is not gross tree-cover loss, deforestation or a pixel-level land-cover change measurement.",
                  "National annual reported/estimated statistics may be interpolated/revised; not direct annual wall-to-wall satellite observations."])
