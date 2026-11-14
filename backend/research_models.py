"""Versioned, explicit research contracts. No user data is persisted by the server."""
from datetime import datetime
from typing import Literal
from pydantic import Field
from backend.models import StrictModel


class ResearchSelection(StrictModel):
    source: Literal["power", "noaa", "worldbank"] = "power"
    indicator: Literal["T2M", "PRECTOTCORR", "RH2M", "WS2M", "co2", "forest"] = "T2M"
    latitude: float = Field(default=0.3476, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(default=32.5825, ge=-180, le=180, allow_inf_nan=False)
    country: str = Field(default="UGA", pattern=r"^[A-Z]{3}$")
    start: str = Field(default="1990-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    end: str = Field(default="2024-12", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class ResearchInput(StrictModel):
    selection: ResearchSelection
    comparison: ResearchSelection | None = None
    baseline_start: int = Field(default=1991, ge=1979, le=2100)
    baseline_end: int = Field(default=2020, ge=1979, le=2100)
    question: str = Field(default="", max_length=500)


class ResearchValue(StrictModel):
    period: str
    value: float | None
    uncertainty: float | None = None


class ResearchDataset(StrictModel):
    id: str
    label: str
    source: str
    source_url: str
    documentation_url: str
    license: str
    attribution: str
    retrieved_at: datetime | None
    kind: str
    unit: str
    frequency: Literal["monthly", "annual"]
    spatial_scope: str
    resolution: str
    location: str
    requested_start: str
    requested_end: str
    available_start: str | None
    available_end: str | None
    coverage_percent: float
    expected_count: int
    valid_count: int
    warnings: list[str]
    values: list[ResearchValue]
    fingerprint: str
    selection: ResearchSelection


class MethodResult(StrictModel):
    status: str
    label: str
    estimate: float | None = None
    unit: str = ""
    lower: float | None = None
    upper: float | None = None
    p_value: float | None = None
    details: str


class SeasonalMonth(StrictModel):
    month: int
    count: int
    mean: float | None
    std: float | None


class AnomalyValue(StrictModel):
    period: str
    difference: float | None
    z_score: float | None
    outlier: bool
    score: float | None
    spi3: float | None


class AnalysisResult(StrictModel):
    status: str
    method_version: str
    window: str
    baseline: str
    n: int
    complete_years: int
    coverage_percent: float
    annual_values: list[ResearchValue]
    ols: MethodResult
    sen: MethodResult
    mann_kendall: MethodResult
    change_point: MethodResult
    spi: MethodResult
    seasonality: list[SeasonalMonth]
    anomalies: list[AnomalyValue]
    warnings: list[str]
    interpretation: list[str]


class ComparisonRow(StrictModel):
    period: str
    left: float
    right: float
    difference: float


class ComparisonResult(StrictModel):
    status: str
    matched_count: int
    mean_difference: float | None
    unit: str
    pearson: float | None
    spearman: float | None
    method: str
    warnings: list[str]
    values: list[ComparisonRow]


class ResearchResult(StrictModel):
    dataset: ResearchDataset
    analysis: AnalysisResult
    comparison_dataset: ResearchDataset | None
    comparison_analysis: AnalysisResult | None
    comparison: ComparisonResult | None
    explanation_mode: str
    answer: str
    generated_at: datetime


class ConnectorRecord(StrictModel):
    id: str
    name: str
    status: str
    detail: str
    documentation_url: str
    setup: list[str]
    secret_names: list[str]


class SpatialLayer(StrictModel):
    id: str
    title: str
    template: str
    legend: str | None
    start: str | None
    end: str | None
    default_date: str | None
    max_zoom: int
    attribution: str
    caveat: str
    documentation_url: str


class SpatialCatalog(StrictModel):
    retrieved_at: datetime
    layers: list[SpatialLayer]


class FireInput(StrictModel):
    source: Literal["public_modis", "firms_viirs"] = "public_modis"
    west: float = Field(default=29, ge=-180, le=180, allow_inf_nan=False)
    south: float = Field(default=-2, ge=-90, le=90, allow_inf_nan=False)
    east: float = Field(default=36, ge=-180, le=180, allow_inf_nan=False)
    north: float = Field(default=5, ge=-90, le=90, allow_inf_nan=False)
    days: int = Field(default=1, ge=1, le=5)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class FirePoint(StrictModel):
    latitude: float
    longitude: float
    acquired: str
    satellite: str
    confidence: str
    frp_mw: float | None


class FireDataset(StrictModel):
    source: str
    source_url: str
    retrieved_at: datetime
    coverage_start: str | None
    coverage_end: str | None
    count_in_bbox: int
    returned_count: int
    truncated: bool
    resolution: str
    attribution: str
    warnings: list[str]
    features: list[FirePoint]
    selection: FireInput
