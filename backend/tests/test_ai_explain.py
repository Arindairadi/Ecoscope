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
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
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


@pytest.mark.parametrize("response,status,used", [
    ({"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"text": "Thinking 999", "thought": True},
        {"text": "These are modelled estimates with uncertainty."}]}}]}, 200, True),
    ({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "Warming is 9.9 degrees."}]}}]}, 200, False),
    ({"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "Incomplete"}]}}]}, 200, False),
    ({"promptFeedback": {"blockReason": "SAFETY"}}, 200, False),
    ({"error": {"message": "Quota exceeded"}}, 429, False),
    ({"candidates": None}, 200, False),
])
def test_gemini_transport_and_fallback(monkeypatch, response, status, used):
    import httpx
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("GEMINI_MODEL", "test-model")
    def handler(request):
        assert str(request.url) == "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent"
        assert request.headers["x-goog-api-key"] == "test-gemini-key"
        assert "test-gemini-key" not in str(request.url)
        body = json.loads(request.content)
        assert body["systemInstruction"]["parts"][0]["text"] == llm_explain.SYSTEM
        assert "<facts>" in body["contents"][0]["parts"][0]["text"]
        return httpx.Response(status, json=response)
    original = httpx.AsyncClient
    monkeypatch.setattr(llm_explain.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    result = client.post("/api/research/run", json=BODY)
    assert result.status_code == 200
    assert (result.json()["explanation_mode"] == "ai_grounded_numbers_verified") == used


def test_gemini_requires_key_and_model(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    assert not llm_explain.enabled()
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    assert not llm_explain.enabled()
    monkeypatch.setenv("GEMINI_MODEL", "test-model")
    assert llm_explain.enabled()
    monkeypatch.setenv("GEMINI_MODEL", "../../invalid")
    assert client.post("/api/research/run", json=BODY).json()["explanation_mode"].endswith("ai_unavailable")
    monkeypatch.setenv("AI_PROVIDER", "unknown")
    assert not llm_explain.enabled()
