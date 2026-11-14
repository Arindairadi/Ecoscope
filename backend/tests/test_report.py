"""TEST ONLY synthetic data; no live upstream requests."""
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend import research_routes
from backend.services.report import clean
from backend.tests.test_research import fixture_dataset

client = TestClient(app)
BODY = {"selection": {"source": "power", "indicator": "T2M", "start": "1990-01", "end": "2024-12"},
        "baseline_start": 1991, "baseline_end": 2020, "question": "Is it warming?"}


@pytest.fixture
def fake_data(monkeypatch):
    async def fake(selection):
        return fixture_dataset(indicator=selection.indicator)
    monkeypatch.setattr(research_routes, "get_dataset", fake)


def test_report_is_a_real_pdf(fake_data):
    r = client.post("/api/research/report", json=BODY)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(r.content) > 4000
    assert "ecoscope-report-" in r.headers["content-disposition"] and "no-store" in r.headers["cache-control"]


@pytest.mark.parametrize("lang", ["fr", "sw", "lg"])
def test_report_languages(fake_data, lang):
    assert client.post(f"/api/research/report?language={lang}", json=BODY).content.startswith(b"%PDF")


def test_report_rejects_bad_language_and_bad_input(fake_data):
    assert client.post("/api/research/report?language=xx", json=BODY).status_code == 422
    assert client.post("/api/research/report", json={**BODY, "baseline_start": 1900}).status_code == 422


def test_report_precipitation_and_comparison(fake_data):
    body = {**BODY, "selection": {**BODY["selection"], "indicator": "PRECTOTCORR"},
            "comparison": {**BODY["selection"], "indicator": "PRECTOTCORR", "latitude": 2.7, "longitude": 32.3}}
    assert client.post("/api/research/report", json=body).status_code == 200


def test_symbols_are_made_printable():
    assert clean("CO₂ ≥ 5 °C – “ok”") == 'CO2 >= 5 °C – "ok"'
    assert "?" not in clean("ppm → 日本")[:4]
