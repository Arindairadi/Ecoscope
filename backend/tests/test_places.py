import json
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)


def test_country_list_is_real_and_complete_enough():
    body = client.get("/api/places/countries").json()
    iso = {c["iso3"]: c for c in body["countries"]}
    assert len(iso) > 200 and {"UGA", "KEN", "TZA", "FRA", "BRA"} <= iso.keys()
    uga = iso["UGA"]
    assert 29 < uga["longitude"] < 36 and -2 < uga["latitude"] < 5
    assert "Natural Earth" in body["attribution"]


def test_admin1_geojson_for_uganda():
    r = client.get("/api/places/countries/UGA/admin1")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) > 20
    for f in fc["features"]:
        p = f["properties"]
        assert p["name"] and -5 < p["latitude"] < 6 and 28 < p["longitude"] < 36
        assert f["geometry"]["type"] in {"Polygon", "MultiPolygon"}


def test_admin1_rejects_bad_codes_and_path_tricks():
    assert client.get("/api/places/countries/uga/admin1").status_code == 422
    assert client.get("/api/places/countries/XXX/admin1").status_code == 404
    assert client.get("/api/places/countries/..%2F..%2Fapp/admin1").status_code in (404, 422)
