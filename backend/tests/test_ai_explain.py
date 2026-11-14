"""TEST ONLY: the model call is always replaced; no network, no key spent."""
import json
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend import research_routes
from backend.services import llm_explain
from backend.tests.test_research import fixture_dataset

client = TestClient(app)
BODY = {"selection": {"source": "power", "indicator": "T2M", "start": "1990-01", "end": "2024-12"},
        "baseline_start": 1991, "baseline_end": 2020, "question": "Is it warming?", "use_ai": True}


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    async def fake(selection):
        return fixture_dataset(indicator=selection.indicator)
    monkeypatch.setattr(research_routes, "get_dataset", fake)
    monkeypatch.setattr(llm_explain, "budget", llm_explain.Budget())
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")


def facts_for_fixture():
    from backend.services.research_science import analyze
    from backend.research_models import ResearchResult
    from datetime import datetime, timezone
    d = fixture_dataset(); a = analyze(d, 1991, 2020)
    return llm_explain.build_facts(ResearchResult(dataset=d, analysis=a, comparison_dataset=None, comparison_analysis=None,
                                                  comparison=None, explanation_mode="x", answer="", generated_at=datetime.now(timezone.utc)))


def test_verification_accepts_only_numbers_from_the_facts():
    text = json.dumps(facts_for_fixture())
    assert llm_explain.verified("The slope is 2 °C per year over 35 years.", text)
    assert not llm_explain.verified("The slope is 2.7 °C per year.", text)
    assert not llm_explain.verified("Warming will reach 4 degrees by 2100.", text)
    assert llm_explain.verified("No numbers here at all.", text)


def test_ai_answer_used_when_verified(monkeypatch):
    async def ok(facts, question, language):
        assert "question" not in facts and language == "en"
        return "The data show a steady rise of 2 °C per year, but these are modelled estimates."
    monkeypatch.setattr(llm_explain, "call_model", ok)
    r = client.post("/api/research/run", json=BODY).json()
    assert r["explanation_mode"] == "ai_grounded_numbers_verified" and "steady rise" in r["answer"]


def test_invented_number_falls_back_to_rule_based(monkeypatch):
    async def bad(facts, question, language):
        return "Temperature will rise by 9.9 degrees."
    monkeypatch.setattr(llm_explain, "call_model", bad)
    r = client.post("/api/research/run", json=BODY).json()
    assert r["explanation_mode"] == "deterministic_statistical_rule_based_ai_unavailable" and "9.9" not in r["answer"]


def test_no_key_or_not_requested(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    assert client.post("/api/research/run", json=BODY).json()["explanation_mode"].endswith("ai_unavailable")
    r = client.post("/api/research/run", json={**BODY, "use_ai": False}).json()
    assert r["explanation_mode"] == "deterministic_statistical_rule_based"


def test_model_errors_and_rate_limit(monkeypatch):
    import httpx
    async def boom(facts, question, language):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(llm_explain, "call_model", boom)
    assert client.post("/api/research/run", json=BODY).json()["explanation_mode"].endswith("ai_unavailable")
    b = llm_explain.Budget()
    monkeypatch.setattr(llm_explain, "PER_CLIENT_HOURLY", 2)
    assert [b.allow("a"), b.allow("a"), b.allow("a"), b.allow("b")] == [True, True, False, True]


def test_bad_language_rejected():
    assert client.post("/api/research/run", json={**BODY, "language": "xx"}).status_code == 422
