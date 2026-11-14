# NASA POWER monthly temperature integration

## Official verification (2026-11-14)

Reviewed official NASA POWER documentation before enabling this one source:

- [Monthly and Annual API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/): monthly/annual JSON, year arguments, maximum 20 parameters for a point, meteorology based on MERRA-2 from 1981 through the previous year.
- [Live monthly OpenAPI](https://power.larc.nasa.gov/api/temporal/monthly/openapi.json): version **v2.10.0**, point route, YYYY integer start/end, no security requirement.
- [Official NASA POWER site metadata](https://power.larc.nasa.gov/llms.txt): publicly accessible endpoints without authentication; free/open access; **CC BY 4.0** license declaration.
- [Referencing guide](https://power.larc.nasa.gov/docs/referencing/): credit NASA Langley POWER and its NASA Earth Science Division funding; include service name, version and access date. NASA requests notification of publications and redistribution.
- [Services](https://power.larc.nasa.gov/docs/services/) and [API tutorial](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/): native meteorology grid is **0.5° latitude × 0.625° longitude**; avoid unnecessarily dense spatial requests and excess concurrent requests. Tutorial advises no more than five concurrent requests. This app allows only one upstream request at a time per server process.
- [Data FAQ](https://power.larc.nasa.gov/docs/faqs/data/): units depend on community, grid-cell/terrain averaging matters, archives can be revised.
- [Meteorology FAQ](https://power.larc.nasa.gov/docs/faqs/meteorology/): monthly averaged temperature at 2 metres is available.

One old methodology URL returned 404. The current [methodology index](https://power.larc.nasa.gov/docs/methodology/) was consulted instead; it describes MERRA-2 and near-real-time model products. This increment intentionally uses the completed-year monthly product, and verifies `header.sources == ["MERRA2"]` before labeling a response as MERRA-2.

A genuine request at Kampala **0.3476° N, 32.5825° E**, 2020–2021 returned:

- `T2M`, metadata long name `Temperature at 2 Meters`, native unit **C** (displayed **°C**, no numerical conversion).
- `header.sources: ["MERRA2"]`, fill value **-999**, API version **v2.10.0**.
- January 2020 **22.27°C**, February **23.16°C**, March **22.42°C**.
- Annual keys `202013` and `202113` also occurred; they are **excluded** from monthly results.
- The actual response reported time standard **LST**. Although the general FAQ describes other temporal-level defaults, the app preserves the returned header instead of overwriting it with an assumed UTC label. A month is a monthly period, not an instantaneous measurement.

Live results are time-specific checks, not an uptime guarantee or promise that the archive will never be revised.

## Application contract and semantics

`GET /api/power/monthly?latitude=0.3476&longitude=32.5825&start=2020-01&end=2021-12`

- One point and **T2M only**, Agroclimatology community `AG`.
- Finite latitude −90…90, longitude −180…180; normalize to four decimal places consistently in request and returned coordinates. This precision is **not** the source resolution.
- YYYY-MM dates, start in 1981 or later, no future months, maximum **240 months** inclusive.
- NASA accepts whole years; request the covering years once and subset locally to the requested months.
- Do not request the current incomplete source year: months beyond the documented previous-year availability remain gaps. A wholly unavailable current-year request returns `no_data`, with **no retrieval timestamp**, because no upstream retrieval occurred.
- Build every requested monthly slot. Missing keys, nulls, source fill values and nonfinite values stay `null`. A genuine zero remains zero.
- `YYYY13` annual values cannot enter a monthly timeline because only exact requested `YYYY01`…`YYYY12` keys are read.
- Available start/end mean **first/last valid months inside this selection**, not the whole archive’s availability. Completeness is valid monthly values divided by all requested months.
- Summaries use valid months only; mean is **equal-month-weighted**, not a day-weighted annual average or trend estimate. No slope, significance, causal claim or forecast is produced.
- Result is **NASA POWER MERRA-2 reanalysis/modelled estimates**. It is not a station observation, local thermometer, countrywide average, or forecast. A Kampala/Gulu/Uganda point preset does not represent Uganda as a national aggregate.
- Return raw numerical precision; round only for UI display. No uncertainty interval is invented.
- An unexpected unit, parameter identity or source fails explicitly instead of being silently relabeled.

## Upstream usage, errors and freshness

The client uses a fixed NASA host, fixed parameter/community, verified HTTPS, no redirects, a 25-second total network timeout, and a 2MB response limit.

One upstream request at a time, minimum one second between requests, two-second queue wait. Identical in-flight requests share the cached result after the first finishes. Bounded LRU cache: at most 128 point/year-range responses, six-hour TTL. Successful cached data retains its **original retrieval timestamp**; no stale/expired fallback is served. Cache is memory only and lost on restart—this is not persistent storage.

Source failures are cached for 30 seconds to prevent retry storms. HTTP 502 means upstream failure/invalid response, 503 means rate limit/busy, 504 means timeout. A `Retry-After: 30` header accompanies source failures; wait before retrying. No automatic upstream retry or fabricated data fallback.

These controls apply per process, not across future horizontally scaled instances. Broader public traffic requires a shared rate limiter/cache design before scaling.

## UI and export

The browser uses explicit load/submit, not a request on every keystroke, pan or cursor movement. All applied coordinates/months belong in the query key; edited selections must not relabel old data. A failed/new request must not present an old series as if it belonged to the new point.

The chart uses gaps for nulls and excludes annual aggregates. Downloaded JSON is the exact displayed API result, including months, nulls, selected coordinates, source query URL, retrieval timestamp, version, units, data kind, attribution/license and caveat. A download does not trigger another NASA request and is not a saved shared analysis.

## Explicitly not included

No Supabase credentials or persistent storage, GitHub authorization, additional scientific sources, LLMs, trend inference, national aggregation, publishing, plan upgrades or paid add-ons.
