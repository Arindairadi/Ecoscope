"""Read-only, credential-free Phase 1 REST foundation."""
from datetime import date, datetime, timezone

from fastapi import FastAPI, HTTPException, Query

from backend.catalog import INDICATORS, REGIONS, SOURCES
from backend.models import Foundation, HealthStatus, Indicator, Region, Series

app = FastAPI(
    title="EARTHSCOPE API",
    version="0.1.0",
    description="Phase 1 foundation. No scientific datasets or external database connected.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


@app.get("/api/healthz", response_model=HealthStatus, operation_id="healthCheck")
def health_check():
    return HealthStatus(status="ok", service="EARTHSCOPE FastAPI",
                        timestamp=datetime.now(timezone.utc))


@app.get("/api/foundation", response_model=Foundation, operation_id="getFoundation")
def foundation():
    return Foundation(
        phase="Phase 1 · Foundation",
        backend="FastAPI",
        database="not_connected",
        scientificData="not_connected",
        sources=SOURCES,
        capabilities=["REST health and catalog", "Validated geographic and date selection",
                      "Explicit empty scientific results", "No credentials required"],
    )


@app.get("/api/regions", response_model=list[Region], operation_id="getRegions")
def regions():
    return REGIONS


@app.get("/api/indicators", response_model=list[Indicator], operation_id="getIndicators")
def indicators():
    return INDICATORS


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
        message="No scientific source is connected. No measurements, trends or statistics have been generated.",
        region=region, indicator=indicator, start=start, end=end, unit=selected.unit,
        observations=[],
    )
