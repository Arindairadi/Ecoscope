"""Read-only, credential-free Phase 1 REST foundation."""
from datetime import date, datetime, timezone

from fastapi import FastAPI, HTTPException, Query

from backend.catalog import INDICATORS, REGIONS, SOURCES
from backend.models import Foundation, HealthStatus, Indicator, PowerSeries, Region, Series
from backend.services.power import PowerError, monthly_temperature
from backend.research_routes import router as research_router

app = FastAPI(
    title="Ecoscope API",
    version="1.0.0",
    description="Ecoscope public scientific series, transparent exploratory analysis and source capabilities. Shared cloud persistence and authorized sources remain gated.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.include_router(research_router)


@app.get("/api/healthz", response_model=HealthStatus, operation_id="healthCheck")
def health_check():
    return HealthStatus(status="ok", service="Ecoscope FastAPI",
                        timestamp=datetime.now(timezone.utc))


@app.get("/api/foundation", response_model=Foundation, operation_id="getFoundation")
def foundation():
    return Foundation(
        phase="Phase 2 · First scientific source",
        backend="FastAPI",
        database="not_connected",
        scientificData="nasa_power_adapter_available",
        sources=SOURCES,
        capabilities=["REST health and catalog", "Validated geographic and date selection",
                      "NASA POWER monthly T2M point retrieval", "No credentials required"],
    )


@app.get("/api/regions", response_model=list[Region], operation_id="getRegions")
def regions():
    return REGIONS


@app.get("/api/indicators", response_model=list[Indicator], operation_id="getIndicators")
def indicators():
    return INDICATORS


@app.get("/api/power/monthly", response_model=PowerSeries, operation_id="getPowerMonthly")
async def power_monthly(latitude: float = Query(ge=-90, le=90, allow_inf_nan=False),
                        longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
                        start: str = Query(max_length=7), end: str = Query(max_length=7)):
    try:
        return await monthly_temperature(latitude, longitude, start, end)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except PowerError as exc:
        raise HTTPException(exc.status, str(exc), headers={"Retry-After": "30"}) from exc


@app.get("/api/series", response_model=Series, operation_id="getSeries")
def series(region: str = Query(max_length=50), indicator: str = Query(max_length=50),
           start: date = Query(), end: date = Query()):
    if region not in {r.id for r in REGIONS}:
        raise HTTPException(422, "Unknown region preset.")
    selected = next((i for i in INDICATORS if i.id == indicator), None)
    if selected is None:
        raise HTTPException(422, "Unknown indicator.")
    if start > end:
        raise HTTPException(422, "Start date must be on or before end date.")
    if end > datetime.now(timezone.utc).date():
        raise HTTPException(422, "Future observations are unavailable. Forecast support is pending.")
    return Series(
        status="not_connected",
        message="This registry series endpoint has no data. Temperature is available separately through the NASA POWER point-query service; other indicators remain pending.",
        region=region, indicator=indicator, start=start, end=end, unit=selected.unit,
        observations=[],
    )
