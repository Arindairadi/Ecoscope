"""Countries and first-level administrative boundaries (Natural Earth, public domain).

Boundaries are static, simplified files shipped with the app (no upstream calls).
They are for place selection and map context only, not for survey-grade boundaries
or any legal/territorial claim.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

DATA = Path(__file__).resolve().parent / "data"
ATTRIBUTION = ("Made with Natural Earth (public domain). Boundaries are simplified for display "
               "and are not authoritative or survey-grade.")
router = APIRouter(prefix="/api/places", tags=["Places"])


@lru_cache(maxsize=1)
def _countries() -> list[dict]:
    return json.loads((DATA / "countries.json").read_text(encoding="utf-8"))


@router.get("/countries", operation_id="listCountries")
def list_countries():
    return JSONResponse({"attribution": ATTRIBUTION, "countries": _countries()},
                        headers={"Cache-Control": "public, max-age=86400"})


@router.get("/countries/{iso3}/admin1", operation_id="getCountryAdmin1")
def country_admin1(iso3: str):
    if not re.fullmatch(r"[A-Z]{3}", iso3):
        raise HTTPException(422, "Use an upper-case ISO 3166-1 alpha-3 country code, e.g. UGA.")
    path = DATA / "admin1" / f"{iso3}.json"
    if iso3 not in {c["iso3"] for c in _countries()} or not path.is_file():
        raise HTTPException(404, "No administrative boundaries are bundled for this country.")
    fc = json.loads(path.read_text(encoding="utf-8"))
    fc["attribution"] = ATTRIBUTION
    return JSONResponse(fc, headers={"Cache-Control": "public, max-age=86400"})
