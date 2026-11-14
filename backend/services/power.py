"""NASA POWER T2M only: bounded point retrieval, provenance, gaps, no trends.

Monthly source years are requested once and subset into user-selected months.
Only completed source years are requested, per NASA monthly documentation.
Cache is process-local, not persistent storage, and stores original retrieval time.
"""
import asyncio
from collections import OrderedDict
from datetime import date, datetime, timezone
import json
import math
import re
import time
from urllib.parse import urlencode

import httpx

from backend.models import MonthlyValue, PowerSeries

ENDPOINT = "https://power.larc.nasa.gov/api/temporal/monthly/point"
DOCS = "https://power.larc.nasa.gov/docs/services/api/temporal/monthly/"
ATTRIBUTION = (
    "Data obtained from NASA Langley Research Center's Prediction Of Worldwide "
    "Energy Resources (POWER) project, funded through the NASA Earth Science Division. "
    "MERRA-2 reanalysis; NASA POWER Monthly and Annual API. "
    "Cite the service version and retrieval date supplied with this dataset."
)
SPATIAL_CAVEAT = (
    "Point query of a MERRA-2 grid estimate at native 0.5° latitude × 0.625° longitude "
    "resolution (roughly 50–70 km near the equator). Nearby points may share a grid cell. "
    "Not a direct station observation, a local thermometer reading, a forecast, "
    "or a countrywide average. Terrain within a grid cell is averaged; uncertainty "
    "intervals are not supplied here."
)


class PowerError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def validate_selection(latitude: float, longitude: float, start: str, end: str) -> list[str]:
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("Latitude must be finite and between -90 and 90.")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("Longitude must be finite and between -180 and 180.")
    if not all(re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", m) for m in (start, end)):
        raise ValueError("Use YYYY-MM month values.")
    if start < "1981-01" or start > end:
        raise ValueError("Range must start in 1981 or later, with start on or before end.")
    if end > date.today().strftime("%Y-%m"):
        raise ValueError("Future months are not supported; this is not a forecast.")
    first, last = (int(start[:4]) * 12 + int(start[5:]) - 1,
                   int(end[:4]) * 12 + int(end[5:]) - 1)
    if last - first + 1 > 240:
        raise ValueError("Request at most 240 months (20 years) at one point.")
    return [f"{n // 12:04d}-{n % 12 + 1:02d}" for n in range(first, last + 1)]


def source_url(latitude: float, longitude: float, first_year: int, last_year: int) -> str:
    return ENDPOINT + "?" + urlencode({
        "parameters": "T2M", "community": "AG", "latitude": latitude,
        "longitude": longitude, "start": first_year, "end": last_year, "format": "JSON",
    })


def parse_monthly(payload: dict | None, *, latitude: float, longitude: float,
                  months: list[str], url: str, retrieved_at: datetime | None) -> PowerSeries:
    """Pure parser: source fixtures only belong in tests, never in runtime fallback."""
    header = {}
    raw = {}
    if payload is not None:
        try:
            header = payload["header"]
            parameter = payload["parameters"]["T2M"]
            raw = payload["properties"]["parameter"]["T2M"]
            if parameter["units"] != "C":
                raise PowerError("NASA returned unexpected T2M units; no conversion was guessed.")
            if header["sources"] != ["MERRA2"]:
                raise PowerError("NASA returned a different source; cannot label this MERRA-2.")
            if parameter["longname"] != "Temperature at 2 Meters":
                raise PowerError("NASA T2M parameter metadata changed; review required.")
            if not isinstance(raw, dict):
                raise TypeError("Monthly data is not a mapping")
            if not isinstance(header.get("api"), dict) or not isinstance(header["api"].get("version"), str):
                raise ValueError("Missing API version")
            if not isinstance(header.get("time_standard"), str):
                raise ValueError("Missing time standard")
            fill = float(header["fill_value"])
            if not math.isfinite(fill):
                raise ValueError("Invalid fill value")
        except (KeyError, TypeError, ValueError) as exc:
            raise PowerError("NASA returned incomplete or malformed T2M metadata/data.") from exc
    else:
        fill = -999.0  # no payload values are processed in the no-request case
    values = []
    for month in months:
        # Exact YYYYMM lookups intentionally exclude NASA YYYY13 annual aggregates.
        value = raw.get(month.replace("-", ""))
        if value is None:
            clean = None
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            clean = float(value) if math.isfinite(value) and value != fill else None
        else:
            raise PowerError("NASA returned a nonnumeric monthly temperature.")
        values.append(MonthlyValue(month=month, value=clean))
    valid = [v for v in values if v.value is not None]
    numbers = [v.value for v in valid]
    return PowerSeries(
        status="ok" if valid else "no_data",
        message=("Monthly MERRA-2 modelled estimates. Missing months remain gaps; "
                 "annual aggregates excluded. Mean gives each available month equal weight."
                 if valid else "No valid monthly estimates in this requested range. "
                 "NASA monthly meteorology is documented through the previous year; "
                 "no values were fabricated."),
        latitude=latitude, longitude=longitude,
        requested_start=months[0], requested_end=months[-1],
        available_start=valid[0].month if valid else None,
        available_end=valid[-1].month if valid else None,
        unit="°C", parameter="T2M", parameter_name="Temperature at 2 Meters",
        kind="modelled_estimate", source="NASA POWER · MERRA-2 reanalysis",
        source_url=url, documentation_url=DOCS, retrieved_at=retrieved_at,
        source_version=header.get("api", {}).get("version"),
        source_time_standard=header.get("time_standard"),
        spatial_caveat=SPATIAL_CAVEAT, attribution=ATTRIBUTION,
        license="CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ (NASA POWER official site)",
        expected_months=len(months), valid_months=len(valid),
        missing_months=len(months) - len(valid),
        completeness_percent=len(valid) / len(months) * 100,
        mean=sum(numbers) / len(numbers) if numbers else None,
        minimum=min(numbers) if numbers else None, maximum=max(numbers) if numbers else None,
        values=values,
    )


class PowerClient:
    """Single upstream request at a time, minimum 1s spacing, 6h LRU success cache.

    One fixed host/parameter/community, 128 cached year-range/point responses,
    30s failure cooldown, 2s queue wait, 25s total I/O, 2MB response limit.
    No automatic retry, no expired-data fallback, no credentials or database.
    """
    def __init__(self):
        self.cache = OrderedDict()
        self.lock = asyncio.Lock()
        self.last_request = 0.0

    async def fetch(self, url: str) -> tuple[dict, datetime]:
        now = time.monotonic()
        cached = self.cache.get(url)
        if cached and cached[0] > now:
            self.cache.move_to_end(url)
            if isinstance(cached[1], PowerError):
                raise cached[1]
            return cached[1], cached[2]
        try:
            await asyncio.wait_for(self.lock.acquire(), timeout=2)
        except TimeoutError as exc:
            raise PowerError("NASA request queue busy. Please retry shortly.", 503) from exc
        try:
            cached = self.cache.get(url)
            if cached and cached[0] > time.monotonic():
                if isinstance(cached[1], PowerError):
                    raise cached[1]
                return cached[1], cached[2]
            await asyncio.sleep(max(0, 1 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                payload = await asyncio.wait_for(self._request(url), timeout=25)
                retrieved = datetime.now(timezone.utc)
                # Validate source metadata and monthly value shape before caching.
                parse_monthly(payload, latitude=0, longitude=0, months=["2000-01"],
                              url=url, retrieved_at=retrieved)
                self._store(url, (time.monotonic() + 21600, payload, retrieved))
                return payload, retrieved
            except (httpx.TimeoutException, TimeoutError) as exc:
                error = PowerError("NASA POWER timed out. No substitute data returned.", 504)
                self._store(url, (time.monotonic() + 30, error, None))
                raise error from exc
            except (httpx.HTTPError, json.JSONDecodeError, UnicodeError) as exc:
                error = PowerError("NASA POWER could not be reached or returned invalid JSON. No substitute data returned.")
                self._store(url, (time.monotonic() + 30, error, None))
                raise error from exc
            except PowerError as exc:
                self._store(url, (time.monotonic() + 30, exc, None))
                raise
        finally:
            self.lock.release()

    def _store(self, url, entry):
        self.cache[url] = entry
        self.cache.move_to_end(url)
        while len(self.cache) > 128:
            self.cache.popitem(last=False)

    async def _request(self, url):
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            async with client.stream("GET", url, headers={"User-Agent": "Ecoscope/0.2 scientific-point-explorer"}) as response:
                if response.status_code == 429:
                    raise PowerError("NASA POWER rate limit reached. Wait at least 30 seconds before retrying.", 503)
                if response.status_code != 200:
                    raise PowerError(f"NASA POWER returned HTTP {response.status_code}; no substitute data returned.")
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > 2_000_000:
                        raise PowerError("NASA POWER response exceeded the safety limit.")
                data = json.loads(chunks)
                if not isinstance(data, dict):
                    raise PowerError("NASA POWER response is not a JSON object.")
                return data


power_client = PowerClient()


async def monthly_temperature(latitude: float, longitude: float, start: str, end: str) -> PowerSeries:
    months = validate_selection(latitude, longitude, start, end)
    # Normalize coordinates before request AND output; do not claim precision not queried.
    latitude, longitude = round(latitude, 4), round(longitude, 4)
    last_source_year = min(int(end[:4]), date.today().year - 1)
    if int(start[:4]) > last_source_year:
        return parse_monthly(None, latitude=latitude, longitude=longitude, months=months,
                             url=DOCS, retrieved_at=None)
    url = source_url(latitude, longitude, int(start[:4]), last_source_year)
    payload, retrieved_at = await power_client.fetch(url)
    return parse_monthly(payload, latitude=latitude, longitude=longitude, months=months,
                         url=url, retrieved_at=retrieved_at)
