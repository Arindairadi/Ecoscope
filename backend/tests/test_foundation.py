"""Unit/API contract checks, no third-party calls or fabricated measurements."""
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
import yaml

from backend.app import app
from backend.services.science import calculate_trend, scientific_versions

client = TestClient(app)
PARAMS = {"region": "uganda", "indicator": "temperature", "start": "2015-01-01", "end": "2025-12-31"}


def test_health_is_live_fastapi():
    response = client.get("/api/healthz")
    assert response.status_code == 200
    assert response.json()["service"] == "Ecoscope FastAPI"
    assert datetime.fromisoformat(response.json()["timestamp"]).tzinfo is not None


def test_honest_foundation():
    data = client.get("/api/foundation").json()
    assert data["database"] == "not_connected"
    assert data["scientificData"] == "nasa_power_adapter_available"
    assert len(data["sources"]) == 9
    assert all(s["status"] == "not_connected" for s in data["sources"] if s["id"] not in {"osm", "nasa-power"})
    assert next(s for s in data["sources"] if s["id"] == "nasa-power")["status"] == "adapter_available"


def test_geographic_catalog_has_uganda():
    response = client.get("/api/regions")
    assert response.status_code == 200
    assert "uganda" in [r["id"] for r in response.json()]


def test_indicators_are_planning_metadata():
    data = client.get("/api/indicators").json()
    assert len(data) == 4
    assert all(i["status"] == "not_connected" for i in data if i["id"] != "temperature")


def test_scientific_results_are_empty_and_echo_selection():
    response = client.get("/api/series", params=PARAMS)
    assert response.status_code == 200
    data = response.json()
    assert data["observations"] == []
    assert data["region"] == "uganda"
    assert data["unit"] == "°C"
    assert data["status"] == "not_connected"


@pytest.mark.parametrize("patch", [
    {"region": "unknown"}, {"indicator": "unknown"}, {"start": "2026-01-01"},
    {"start": "bad-date"}, {"end": "2999-01-01"}, {"region": "x" * 51},
])
def test_invalid_selections_rejected(patch):
    assert client.get("/api/series", params=PARAMS | patch).status_code == 422


def test_missing_query_parameters_rejected():
    assert client.get("/api/series").status_code == 422


def test_scientific_dependencies_import():
    assert set(scientific_versions()) == {"pandas", "numpy", "sklearn", "xarray", "geopandas"}


def test_trends_fail_explicitly():
    with pytest.raises(NotImplementedError):
        calculate_trend([])


def test_frontend_contract_matches_runtime():
    spec = yaml.safe_load(Path("lib/api-spec/openapi.yaml").read_text())
    runtime = app.openapi()
    for path, entry in spec["paths"].items():
        full_path = f"/api{path}"
        assert full_path in runtime["paths"]
        if "$ref" in entry:
            research_spec = yaml.safe_load(Path("lib/api-spec/research.yaml").read_text())
            entry = research_spec["paths"][path]
        for method in ("get", "post"):
            if method in entry:
                assert runtime["paths"][full_path][method]["operationId"] == entry[method]["operationId"]
        # Do not make live scientific requests in unit/contract tests.
        if path.startswith("/research/"):
            continue
        if path not in {"/series", "/power/monthly"}:
            result = client.get(full_path)
            assert result.status_code == 200
            schema = entry["get"]["responses"]["200"]["content"]["application/json"]["schema"]
            if "$ref" in schema:
                required = spec["components"]["schemas"][schema["$ref"].split("/")[-1]]["required"]
                assert set(required) <= result.json().keys()
