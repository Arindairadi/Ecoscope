"""Configuration checks expose status, never secrets or false connections."""
import os
import re
from backend.research_models import ConnectorRecord


def configured(*keys):
    return all(bool(os.environ.get(k,"").strip()) for k in keys)


def supabase_config():
    url=os.environ.get("SUPABASE_URL","").strip()
    key=os.environ.get("SUPABASE_ANON_KEY","").strip()
    if not url or not key:
        return "credentials_missing","Browser-local research works without Supabase. No shared cloud persistence is connected."
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co/?",url) or len(key)<20:
        return "invalid_configuration","Supabase URL/key configuration is malformed; no connection attempted."
    return "configured_unverified","Configuration shape valid, but tenant authentication, schema/RLS and database access are not verified. Shared persistence is disabled."


def connector_catalog():
    sbstatus,sbdetail=supabase_config()
    records=[
        ("power","NASA POWER","public_adapter","Monthly point T2M, corrected rainfall rate, relative humidity and wind. MERRA-2/POWER modelled estimates, not station data.","https://power.larc.nasa.gov/docs/services/api/temporal/monthly/",[],[]),
        ("noaa","NOAA GML","public_adapter","Global marine-surface monthly CO₂ observation-derived product; not point air quality.","https://gml.noaa.gov/ccgg/trends/gl_data.html",[],[]),
        ("worldbank","World Bank WDI / FAO","public_adapter","Annual national forest-area percentage. Upstream availability can fail; not pixel-level forest loss. WDI is not the CCKP gridded climate API.","https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation",[],[]),
        ("gibs","NASA Earthdata GIBS","public_adapter","Live-capabilities-based vegetation, land-cover, thermal anomaly, aerosol and historical drought imagery. Qualitative map exploration, not numeric raster extraction. Fire detections are a separate public FIRMS connector.","https://nasa-gibs.github.io/gibs-api-docs/",[],[]),
        ("firms_public","NASA FIRMS public MODIS 24h","public_adapter","Live public MODIS C6.1 NRT satellite detections without a key; bounded area selection. Not exhaustive fires, burned area or a validated fire-trend archive.","https://firms.modaps.eosdis.nasa.gov/active_fire/",[],[]),
        ("firms","NASA FIRMS detections","configured_unverified" if configured("FIRMS_MAP_KEY") else "credentials_missing",
         "Secure bounded VIIRS NOAA-20 hotspot connector implemented; live retrieval not verified without your free MAP_KEY. Satellite detections are not exhaustive fires or burned areas.",
         "https://firms.modaps.eosdis.nasa.gov/api/area/",["Request a free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key .","Add FIRMS_MAP_KEY in Replit Secrets, never in chat or browser code; restart API.","Use a small bounding box and 1–5 days in the explorer; verify response/provenance before research use."],["FIRMS_MAP_KEY"]),
        ("supabase","Supabase / PostGIS",sbstatus,sbdetail,"https://supabase.com/docs/guides/database/postgres/row-level-security",
         ["Choose an existing or owner-created free Supabase project; no project has been provisioned by this app.","Apply docs/supabase.sql in its SQL editor; inspect RLS and enable authentication before any shared research integration.","Set SUPABASE_URL and SUPABASE_ANON_KEY in Replit Secrets. Never expose a service-role key.","Cloud research sync is not implemented or verified; local persistence is the working option."],["SUPABASE_URL","SUPABASE_ANON_KEY"]),
        ("earthdata","NASA Earthdata numeric satellite products","authorization_required","GIBS imagery works publicly. Numeric MODIS/Sentinel vegetation and scientific QA-mask raster processing are not implemented. Earthdata archives commonly require EDL registration/collection-specific access.","https://urs.earthdata.nasa.gov/documentation",
         ["Register an Earthdata Login account, review collection access and citation terms.","Choose a product/region/time and processing pipeline before authorizing server access; do not send credentials in chat."],[]),
        ("copernicus","Copernicus CDS / Sentinel","authorization_required","CDS ERA5 extraction and Sentinel numeric raster processing are not implemented. CDS token plus dataset-terms acceptance and/or CDSE OAuth registration are needed; processing quotas apply.",
         "https://cds.climate.copernicus.eu/how-to-api",["Register at CDS; accept chosen dataset terms manually; obtain a personal access token.","For Sentinel Hub, register a CDSE OAuth client and verify free quota and product licensing. No paid account/add-on has been enabled.","CDS_API_KEY alone does not make this a working integration; a product-specific retrieval/QA pipeline remains pending."],["CDS_API_KEY"]),
        ("gfw","Global Forest Watch","authorization_required","High-resolution tree-cover-loss/alert analysis is not implemented. Most third-party API requests require a key; per-dataset licensing and distinction between loss and deforestation must be reviewed.",
         "https://www.globalforestwatch.org/help/developers/guides/create-and-use-an-api-key",["Create a MyGFW account, obtain an auth token and create a restricted API key through official instructions.","Select the exact dataset, version and license before implementing numeric loss analysis. Never treat WDI forest stocks as Hansen gross loss."],["GFW_API_KEY"]),
        ("earthengine","Google Earth Engine","authorization_required","No Earth Engine integration is implemented. A Cloud project, API enablement and noncommercial eligibility verification or commercial terms are required; no billing was enabled.",
         "https://developers.google.com/earth-engine/guides/access",["Use an owner-controlled Google Cloud project; register for Earth Engine and verify noncommercial eligibility if applicable.","Review dataset licenses and quotas before authorizing an application; do not enable paid services for this project without explicit approval."],[]),
        ("llm","Generative language model","not_configured","Working explanation/Q&A is deterministic statistical/rule-based interpretation, not generative AI. No LLM provider is connected and no usage is billed.","https://platform.openai.com/docs",
         ["Optional only: choose an approved provider and a budget before implementation. A secret alone will not enable ungrounded text generation."],[]),
        ("github","Canonical GitHub repository","authorization_required","Local source control exists; GitHub repository authorization and push remain unverified.","https://docs.github.com/en/authentication",
         ["Open Replit Git pane; connect GitHub and authorize only the intended account/organization and repository.","Select/create one canonical repository, confirm origin and existing history before pushing.","Invite developers with non-admin write permissions where sufficient; require pull-request review before merging. See docs/COLLABORATION.md."],[]),
    ]
    return [ConnectorRecord(id=id,name=name,status=status,detail=detail,documentation_url=url,setup=setup,secret_names=keys)
            for id,name,status,detail,url,setup,keys in records]
