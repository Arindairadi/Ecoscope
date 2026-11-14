"""GIBS rendered imagery is qualitative context, never fabricated pixel statistics."""
import re
import xml.etree.ElementTree as ET
from backend.research_models import SpatialCatalog, SpatialLayer
from backend.services.upstream import public_upstream
from backend.services.power import PowerError

CAPABILITIES="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
ALLOWED={
    "MODIS_Terra_L3_NDVI_Monthly": "Monthly NDVI satellite vegetation-index imagery; cloud/snow/quality masking and missing tiles can leave gaps. Rendered colors are not downloadable numeric NDVI samples.",
    "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual": "Annual categorical IGBP land cover, not forest-loss area, deforestation attribution or a validated pixel-change calculation. Category changes can reflect classification uncertainty.",
    "MODIS_Terra_Thermal_Anomalies_All": "MODIS satellite thermal anomalies, not a comprehensive fire inventory, burned area or active-fire perimeter. Clouds, overpass time and detection limits matter; non-fire hot sources may occur.",
    "MODIS_Terra_Aerosol_Optical_Depth_3km": "Satellite aerosol optical depth retrieval, not surface PM2.5 concentration or a direct air-quality exposure measure. Retrieval/quality gaps are expected.",
    "NDH_Drought_Hazard_Frequency_Distribution_1980-2000": "Historical drought hazard frequency 1980–2000; STATIC historical risk context, not a current drought-monitoring layer, forecast or our calculated SPI.",
}
NS={"w":"http://www.opengis.net/wmts/1.0","o":"http://www.opengis.net/ows/1.1"}


def parse_layers(raw, retrieved):
    try:
        root=ET.fromstring(raw)
        layers=[]
        for node in root.findall(".//w:Layer",NS):
            id=node.findtext("o:Identifier",namespaces=NS)
            if id not in ALLOWED:
                continue
            matrix=node.findtext("w:TileMatrixSetLink/w:TileMatrixSet",namespaces=NS)
            fmt=node.findtext("w:Format",namespaces=NS)
            if not matrix or not re.fullmatch(r"GoogleMapsCompatible_Level\d+",matrix) or fmt not in {"image/png","image/jpeg"}:
                continue
            dimensions=node.findall("w:Dimension",NS);dates=[];default=None
            for dim in dimensions:
                if dim.findtext("o:Identifier",namespaces=NS)=="Time":
                    default=dim.findtext("w:Default",namespaces=NS)
                    for entry in dim.findall("w:Value",NS):
                        dates.extend(re.findall(r"\d{4}-\d{2}-\d{2}",entry.text or ""))
            extension="png" if fmt=="image/png" else "jpg"
            template=f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{id}/default/"+("{time}/" if dimensions else "")+matrix+"/{z}/{y}/{x}."+extension
            legend=node.find("w:Style/w:LegendURL",NS)
            legend_url=legend.get("{http://www.w3.org/1999/xlink}href") if legend is not None else None
            if legend_url and not legend_url.startswith("https://gibs.earthdata.nasa.gov/"):
                legend_url=None
            layers.append(SpatialLayer(id=id,title=node.findtext("o:Title",namespaces=NS) or id,
                template=template,legend=legend_url,start=min(dates) if dates else None,end=max(dates+[default] if default else dates) if dates else None,
                default_date=default,max_zoom=int(matrix.split("Level")[1]),attribution="NASA EOSDIS GIBS / NASA Worldview; acknowledge original instrument/product.",
                caveat=ALLOWED[id],documentation_url="https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/"))
        if not layers:
            raise ValueError("No approved imagery layers in capabilities")
        return SpatialCatalog(retrieved_at=retrieved,layers=layers)
    except (ET.ParseError,ValueError,TypeError) as e:
        raise PowerError("NASA GIBS capabilities could not be validated; no substitute imagery.") from e


async def layer_catalog():
    raw, retrieved=await public_upstream.get(CAPABILITIES,limit=12_000_000,ttl=86400)
    return parse_layers(raw,retrieved)
