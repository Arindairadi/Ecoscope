"""Public MODIS near-real-time detections plus credential-gated VIIRS area API."""
import csv
from datetime import date,datetime,timezone
import io
import math
import os
import re
from backend.research_models import FireInput,FireDataset,FirePoint
from backend.services.power import PowerError
from backend.services.upstream import public_upstream

PUBLIC="https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv"
DOC="https://firms.modaps.eosdis.nasa.gov/api/area/"


def validate_fire(body):
    if body.west>=body.east or body.south>=body.north or body.east-body.west>40 or body.north-body.south>40:
        raise ValueError("Use an ordered bounding box ≤40° wide/high; antimeridian boxes must be split.")
    if body.source=="public_modis" and (body.date is not None or body.days!=1):
        raise ValueError("The public MODIS file is the latest rolling 24 hours only. Historical/custom days require the optional authorized API.")
    if body.date is not None:
        day=date.fromisoformat(body.date)
        if day>date.today():
            raise ValueError("Future fire detections cannot be requested.")


def parse_fires(raw,body,retrieved,url):
    try:
        rows=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        if not {"latitude","longitude","acq_date","acq_time","satellite","confidence","frp"}<=set(rows.fieldnames or []):
            raise ValueError("CSV schema missing")
        features=[];times=[];count=0
        for row in rows:
            lat,lon=float(row["latitude"]),float(row["longitude"])
            if not math.isfinite(lat+lon) or not -90<=lat<=90 or not -180<=lon<=180:
                raise ValueError("Invalid coordinates")
            hhmm=row["acq_time"].zfill(4)
            acquired=datetime.strptime(row["acq_date"]+" "+hhmm,"%Y-%m-%d %H%M").replace(tzinfo=timezone.utc).isoformat()
            times.append(acquired)
            if body.west<=lon<=body.east and body.south<=lat<=body.north:
                count+=1
                if len(features)<2000:
                    frp=float(row["frp"])
                    features.append(FirePoint(latitude=lat,longitude=lon,acquired=acquired,satellite=row["satellite"],
                        confidence=row["confidence"],frp_mw=frp if math.isfinite(frp) and frp>=0 else None))
        return FireDataset(source="NASA FIRMS MODIS Collection 6.1 NRT" if body.source=="public_modis" else "NASA FIRMS VIIRS NOAA-20 NRT",
            source_url=url,retrieved_at=retrieved,coverage_start=min(times) if times else None,coverage_end=max(times) if times else None,
            count_in_bbox=count,returned_count=len(features),truncated=count>len(features),features=features,selection=body,
            resolution="Nominal 1 km MODIS pixel; scan/track footprint varies" if body.source=="public_modis" else "Nominal 375 m VIIRS pixel",
            attribution="NASA LANCE FIRMS; acknowledge NASA/UMD, MODIS/VIIRS data providers. Open NASA Earth science data; cite product, collection and retrieval date.",
            warnings=["Satellite thermal detections, NOT unique fires, burned area, perimeters or a complete fire census; clouds, overpasses, false alarms, industrial heat and detection thresholds matter.",
                      "Near-real-time product subject to revision. Use standard science-quality archives for validated long-term fire trends.",
                      "Acquisition times are UTC; coverage refers to the downloaded source file, not guaranteed observation of every point in the box.",
                      "At most 2000 detections are rendered. Returned data are explicitly bbox-filtered, not a global overview; no fire trend or area statistic is inferred.",
                      "FRP is fire radiative power in MW; MODIS confidence is 0–100, VIIRS confidence is categorical; these are not interchangeable probabilities."])
    except (ValueError,KeyError,UnicodeError) as e:
        raise PowerError("FIRMS returned malformed or unexpected CSV. No detections were invented.") from e


async def fire_detections(body:FireInput):
    validate_fire(body)
    url=PUBLIC;provenance=PUBLIC
    if body.source=="firms_viirs":
        key=os.environ.get("FIRMS_MAP_KEY","").strip()
        if not key:
            raise PowerError("Optional FIRMS VIIRS API is blocked: add your free FIRMS_MAP_KEY as a server-side environment variable. Public MODIS 24h remains available.",503)
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}",key):
            raise PowerError("FIRMS_MAP_KEY configuration is invalid; no upstream request sent.",503)
        bbox=f"{body.west},{body.south},{body.east},{body.north}"
        url=f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA20_NRT/{bbox}/{body.days}"+(f"/{body.date}" if body.date else "")
        provenance=DOC  # Never expose or log the secret-bearing URL.
    raw,retrieved=await public_upstream.get(url,limit=8_000_000,ttl=900)
    return parse_fires(raw,body,retrieved,provenance)
