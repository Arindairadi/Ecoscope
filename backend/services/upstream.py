"""Fixed-host, bounded, per-process public upstream access. Never an open proxy."""
import asyncio
from collections import OrderedDict
from datetime import datetime, timezone
import time
from urllib.parse import urlsplit
import httpx
from backend.services.power import PowerError

HOSTS = frozenset({"power.larc.nasa.gov", "gml.noaa.gov", "api.worldbank.org",
                  "gibs.earthdata.nasa.gov", "firms.modaps.eosdis.nasa.gov"})


class PublicUpstream:
    def __init__(self):
        self.cache = OrderedDict()
        self.lock = asyncio.Lock()
        self.last = 0.0

    async def get(self, url: str, *, limit=2_000_000, ttl=21600):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname not in HOSTS or parts.port not in (None, 443) or parts.username:
            raise ValueError("Only allowlisted HTTPS science services are supported.")
        hit = self.cache.get(url)
        if hit and hit[0] > time.monotonic():
            if isinstance(hit[1], PowerError):
                raise hit[1]
            return hit[1], hit[2]
        try:
            await asyncio.wait_for(self.lock.acquire(), 3)
        except TimeoutError as e:
            raise PowerError("Scientific source queue is busy; retry shortly.", 503) from e
        try:
            hit = self.cache.get(url)
            if hit and hit[0] > time.monotonic():
                if isinstance(hit[1], PowerError):
                    raise hit[1]
                return hit[1], hit[2]
            await asyncio.sleep(max(0, 1.0 - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(35, connect=10), follow_redirects=False) as c:
                    async with c.stream("GET", url, headers={"User-Agent": "Ecoscope/1.0 scientific research; bounded cached retrieval"}) as r:
                        if r.status_code != 200:
                            raise PowerError(f"Scientific source returned HTTP {r.status_code}. No fallback data.", 503 if r.status_code == 429 else 502)
                        raw = bytearray()
                        async with asyncio.timeout(45):
                            async for chunk in r.aiter_bytes():
                                raw.extend(chunk)
                                if len(raw) > limit:
                                    raise PowerError("Scientific response exceeds the safety limit.")
                retrieved = datetime.now(timezone.utc)
                self._store(url, (time.monotonic() + ttl, bytes(raw), retrieved))
                return bytes(raw), retrieved
            except (httpx.TimeoutException, TimeoutError) as e:
                error = PowerError("Scientific source timed out. No substitute values were used.", 504)
                self._store(url, (time.monotonic() + 30, error, None))
                raise error from e
            except httpx.HTTPError as e:
                error = PowerError("Scientific source connection failed. No substitute values were used.")
                self._store(url, (time.monotonic() + 30, error, None))
                raise error from e
            except PowerError as error:
                self._store(url, (time.monotonic() + 30, error, None))
                raise
        finally:
            self.lock.release()

    def _store(self, key, value):
        self.cache[key] = value
        self.cache.move_to_end(key)
        while len(self.cache) > 128:
            self.cache.popitem(last=False)


public_upstream = PublicUpstream()
