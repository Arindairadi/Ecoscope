"""Planning metadata only. Coordinates are viewport centers, not boundaries."""
from backend.models import Indicator, Integration, Region

REGIONS = [
    Region(id="global", name="Global", latitude=12, longitude=18, zoom=2,
           description="Global basemap context; not a scientific aggregation."),
    Region(id="uganda", name="Uganda", latitude=1.3733, longitude=32.2903, zoom=6,
           description="Uganda viewport preset. Administrative boundary ingestion pending."),
    Region(id="east-africa", name="East Africa", latitude=0, longitude=35, zoom=4,
           description="Regional viewport preset, not an authoritative geographic boundary."),
]

INDICATORS = [
    Indicator(id="temperature", name="Air temperature", unit="°C", category="Climate",
              status="adapter_available", description="NASA POWER monthly T2M point/grid MERRA-2 modelled estimates, not station observations or national averages."),
    Indicator(id="precipitation", name="Precipitation", unit="mm/day", category="Climate",
              status="adapter_available", description="Available in the Research workspace as NASA POWER corrected precipitation rate (MERRA-2 modelled estimate, mm/day averaged per month; not gauge data)."),
    Indicator(id="drought", name="Drought (SPI-3)", unit="standard deviations", category="Climate",
              status="adapter_available", description="3-month Standardized Precipitation Index computed in the Research workspace from monthly precipitation; needs a 30-year baseline. A meteorological dryness index, not a full drought assessment."),
    Indicator(id="vegetation", name="Vegetation index", unit="unitless", category="Biosphere",
              status="not_connected", description="Planned NDVI. Product, scale factor and QA filtering pending."),
    Indicator(id="forest-cover", name="Forest cover", unit="%", category="Land",
              status="adapter_available", description="National annual forest area (% of land area) from World Bank WDI / FAO in the Research workspace. Not pixel-level forest loss; tree-cover-loss data is still pending."),
]

SOURCES = [
    Integration(id="nasa-power", name="NASA POWER", status="adapter_available",
                detail="Monthly T2M point-query adapter available without a key. MERRA-2 reanalysis/modelled estimates in °C. Individual requests may fail; successful retrieval is shown with its timestamp. CC BY 4.0; NASA POWER attribution retained.",
                url="https://power.larc.nasa.gov/docs/services/api/"),
    Integration(id="earthdata", name="NASA Earthdata / FIRMS", status="not_connected",
                detail="Pending product-specific Earthdata authentication, FIRMS key and licensing review.",
                url="https://firms.modaps.eosdis.nasa.gov/api/"),
    Integration(id="noaa", name="NOAA", status="adapter_available",
                detail="Global marine-surface monthly CO₂ (NOAA GML) is available without a key. Other NOAA products are not connected.",
                url="https://www.ncei.noaa.gov/cdo-web/webservices/v2"),
    Integration(id="copernicus", name="Copernicus", status="not_connected",
                detail="Pending product, account, download constraints and license verification.",
                url="https://dataspace.copernicus.eu/"),
    Integration(id="world-bank", name="World Bank", status="adapter_available",
                detail="National annual forest-area percentage (AG.LND.FRST.ZS) is available without a key in the Research workspace. Other indicators are not connected.",
                url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589"),
    Integration(id="gfw", name="Global Forest Watch", status="not_connected",
                detail="Pending API access, dataset licensing, resolution and methodology review.",
                url="https://www.globalforestwatch.org/"),
    Integration(id="osm", name="OpenStreetMap", status="basemap_only",
                detail="Public basemap tiles requested by your browser. © OpenStreetMap contributors; no environmental measurements. Tile availability is separate from API health.",
                url="https://www.openstreetmap.org/copyright"),
    Integration(id="earth-engine", name="Google Earth Engine", status="not_connected",
                detail="Pending eligibility, project authorization, quotas and noncommercial/commercial terms review.",
                url="https://developers.google.com/earth-engine"),
    Integration(id="supabase", name="Supabase / PostGIS", status="not_connected",
                detail="Planned only. No database provisioned or credentials requested; server-side access and migrations require approval.",
                url="https://supabase.com/docs/guides/database/extensions/postgis"),
]
