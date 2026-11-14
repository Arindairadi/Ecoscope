"""TEST-ONLY synthetic fixtures. Never imported by the app or used as fallback."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.app import app
from backend.services import power
from backend.services.power import PowerClient, PowerError, parse_monthly, validate_selection

STAMP = datetime(2026, 1, 15, tzinfo=timezone.utc)
PARAMS = {"latitude": 0.3476, "longitude": 32.5825, "start": "2020-01", "end": "2020-03"}


@pytest.fixture
def fixture_payload():
    return {
        "header": {"sources": ["MERRA2"], "fill_value": -999, "api": {"version": "test-only"}, "time_standard": "LST"},
        "parameters": {"T2M": {"units": "C", "longname": "Temperature at 2 Meters"}},
        "properties": {"parameter": {"T2M": {"202001": 10, "202002": -999, "202003": 0, "202013": 99}}},
    }


def parse(payload):
    return parse_monthly(payload, latitude=0.3476, longitude=32.5825,
                         months=["2020-01", "2020-02", "2020-03"],
                         url="https://example.test/test-only", retrieved_at=STAMP)


def test_missing_is_gap_zero_is_valid_annual_excluded(fixture_payload):
    result = parse(fixture_payload)
    assert [m.value for m in result.values] == [10, None, 0]
    assert result.valid_months == 2 and result.missing_months == 1
    assert result.mean == 5 and result.minimum == 0 and result.maximum == 10
    assert result.completeness_percent == pytest.approx(200 / 3)
    assert result.available_start == "2020-01" and result.available_end == "2020-03"
    assert result.retrieved_at == STAMP
    assert result.kind == "modelled_estimate" and result.unit == "°C"


@pytest.mark.parametrize("value", [None, float("nan"), float("inf"), -999])
def test_missing_variants(fixture_payload, value):
    fixture_payload["properties"]["parameter"]["T2M"] = {"202001": value}
    result = parse(fixture_payload)
    assert result.status == "no_data"
    assert all(m.value is None for m in result.values)
    assert result.mean is None and result.completeness_percent == 0


@pytest.mark.parametrize("patch", [
    {"latitude": 91}, {"latitude": -91}, {"longitude": 181}, {"longitude": -181},
    {"latitude": "nan"}, {"longitude": "inf"}, {"start": "1980-12"},
    {"start": "2020-13"}, {"start": "bad"}, {"start": "2020-04"},
    {"end": "2999-01"}, {"start": "1981-01", "end": "2020-12"},
])
def test_invalid_queries_rejected_before_source(patch):
    response = TestClient(app).get("/api/power/monthly", params=PARAMS | patch)
    assert response.status_code == 422


def test_missing_query_fields():
    assert TestClient(app).get("/api/power/monthly").status_code == 422


@pytest.mark.parametrize("field,value", [("units", "K"), ("longname", "Unexpected")])
def test_metadata_changes_fail_explicitly(fixture_payload, field, value):
    fixture_payload["parameters"]["T2M"][field] = value
    with pytest.raises(PowerError):
        parse(fixture_payload)


def test_wrong_source_not_mislabelled(fixture_payload):
    fixture_payload["header"]["sources"] = ["OTHER"]
    with pytest.raises(PowerError):
        parse(fixture_payload)


@pytest.mark.parametrize("field,value", [("api", "bad shape"), ("api", {}), ("time_standard", None)])
def test_missing_version_or_time_standard_rejected(fixture_payload, field, value):
    fixture_payload["header"][field] = value
    with pytest.raises(PowerError):
        parse(fixture_payload)


@pytest.mark.parametrize("payload", [{}, {"header": []}, None])
def test_malformed_or_no_payload(payload):
    if payload is None:
        assert parse(payload).status == "no_data"
    else:
        with pytest.raises(PowerError):
            parse(payload)


def test_nonnumeric_fails_instead_of_zero(fixture_payload):
    fixture_payload["properties"]["parameter"]["T2M"]["202001"] = "not a number"
    with pytest.raises(PowerError):
        parse(fixture_payload)


def test_live_endpoint_contract_with_test_only_transport(monkeypatch, fixture_payload):
    async def fetch(url):
        assert "parameters=T2M" in url and "community=AG" in url
        return fixture_payload, STAMP
    monkeypatch.setattr(power.power_client, "fetch", fetch)
    response = TestClient(app).get("/api/power/monthly", params=PARAMS)
    assert response.status_code == 200
    result = response.json()
    assert result["mean"] == 5
    assert result["source_version"] == "test-only"
    assert result["valid_months"] == 2


@pytest.mark.parametrize("status", [502, 503, 504])
def test_source_errors_are_http_errors_no_data_fallback(monkeypatch, status):
    async def fetch(url):
        raise PowerError("TEST ONLY upstream failure", status)
    monkeypatch.setattr(power.power_client, "fetch", fetch)
    response = TestClient(app).get("/api/power/monthly", params=PARAMS)
    assert response.status_code == status
    assert response.json() == {"detail": "TEST ONLY upstream failure"}
    assert response.headers["Retry-After"] == "30"


def test_no_request_for_unavailable_current_year(monkeypatch):
    async def forbidden(url):
        raise AssertionError("Must not request unsupported year")
    monkeypatch.setattr(power.power_client, "fetch", forbidden)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    result = asyncio.run(power.monthly_temperature(0, 0, month, month))
    assert result.status == "no_data"
    assert result.retrieved_at is None


def test_success_cache_coalesces_concurrent_requests_and_preserves_retrieval(fixture_payload):
    client = PowerClient()
    calls = []
    async def request(url):
        calls.append(url)
        await asyncio.sleep(0.02)
        return deepcopy(fixture_payload)
    client._request = request
    async def run():
        one, two = await asyncio.gather(client.fetch("test-only"), client.fetch("test-only"))
        three = await client.fetch("test-only")
        assert one == two == three
    asyncio.run(run())
    assert len(calls) == 1


def test_failure_cooldown_prevents_retry_storm():
    client = PowerClient()
    calls = []
    async def request(url):
        calls.append(url)
        raise httpx.ReadTimeout("TEST ONLY timeout")
    client._request = request
    async def run():
        for _ in range(2):
            with pytest.raises(PowerError) as exc:
                await client.fetch("test-only")
            assert exc.value.status == 504
    asyncio.run(run())
    assert len(calls) == 1


@pytest.mark.parametrize("status,body,expected", [
    (429, {}, 503), (500, {}, 502), (200, ["wrong shape"], 502),
])
def test_actual_http_transport_errors(monkeypatch, status, body, expected):
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=body))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_client(transport=transport, **kw))
    with pytest.raises(PowerError) as exc:
        asyncio.run(PowerClient()._request("https://example.test/test-only"))
    assert exc.value.status == expected


def test_request_bounds_inclusive():
    assert len(validate_selection(90, -180, "2000-01", "2019-12")) == 240
    assert validate_selection(0, 0, "2020-02", "2020-02") == ["2020-02"]
