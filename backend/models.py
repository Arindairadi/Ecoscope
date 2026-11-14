"""Validated scientific result contracts; never silently substitute zero for missing."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthStatus(StrictModel):
    status: str
    service: str
    timestamp: datetime


class Region(StrictModel):
    id: str
    name: str
    latitude: float
    longitude: float
    zoom: int
    description: str


class Indicator(StrictModel):
    id: str
    name: str
    unit: str
    category: str
    status: str
    description: str


class Integration(StrictModel):
    id: str
    name: str
    status: str
    detail: str
    url: str


class Foundation(StrictModel):
    phase: str
    backend: str
    database: str
    scientificData: str
    sources: list[Integration]
    capabilities: list[str]


class Observation(StrictModel):
    timestamp: datetime
    value: float | None
    unit: str
    source: str
    retrievedAt: datetime
    kind: Literal["observation", "modelled_estimate", "forecast", "demonstration"]


class Series(StrictModel):
    status: Literal["not_connected"]
    message: str
    region: str
    indicator: str
    start: date
    end: date
    unit: str
    observations: list[Observation]


class MonthlyValue(StrictModel):
    month: str
    value: float | None


class PowerSeries(StrictModel):
    status: Literal["ok", "no_data"]
    message: str
    latitude: float
    longitude: float
    requested_start: str
    requested_end: str
    available_start: str | None
    available_end: str | None
    unit: str
    parameter: str
    parameter_name: str
    kind: str
    source: str
    source_url: str
    documentation_url: str
    retrieved_at: datetime | None
    source_version: str | None
    source_time_standard: str | None
    spatial_caveat: str
    attribution: str
    license: str
    expected_months: int
    valid_months: int
    missing_months: int
    completeness_percent: float
    mean: float | None
    minimum: float | None
    maximum: float | None
    values: list[MonthlyValue]
