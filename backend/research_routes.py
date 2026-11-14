"""Read-only research endpoints: validated source selections, no arbitrary URLs."""
import asyncio
from datetime import datetime,timezone
from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool
from backend.research_models import ResearchInput, ResearchResult, ConnectorRecord, SpatialCatalog
from backend.services.datasets import get_dataset, periods
from backend.services.research_science import analyze, compare
from backend.services.explanations import answer_question
from backend.services.connectors import connector_catalog
from backend.services.spatial import layer_catalog
from backend.services.power import PowerError
from backend.research_models import FireInput,FireDataset
from backend.services.fires import fire_detections

router=APIRouter(prefix="/api/research",tags=["Scientific research"])
compute_slots=asyncio.Semaphore(2)


@router.post("/fires",response_model=FireDataset,operation_id="getFireDetections")
async def fires(body:FireInput):
    try:
        return await fire_detections(body)
    except ValueError as e:
        raise HTTPException(422,str(e)) from e
    except PowerError as e:
        raise HTTPException(e.status,str(e),headers={"Retry-After":"30"}) from e


def validate_input(body):
    for selection in [body.selection]+([body.comparison] if body.comparison else []):
        periods(selection,annual=selection.source=="worldbank")
        if body.baseline_start>body.baseline_end or body.baseline_start<int(selection.start[:4]) or body.baseline_end>int(selection.end[:4]):
            raise ValueError("Baseline must be ordered and inside each requested data window.")
    if body.comparison:
        a,b=body.selection,body.comparison
        if (a.source,a.indicator,a.start,a.end)!=(b.source,b.indicator,b.start,b.end):
            raise ValueError("Comparison must use the same source, indicator and requested date range.")
        if a.source=="noaa":
            raise ValueError("NOAA global CO₂ has no point-location comparison.")


@router.post("/run",response_model=ResearchResult,operation_id="runResearch")
async def run_research(body:ResearchInput):
    try:
        validate_input(body)
        dataset=await get_dataset(body.selection)
        second=await get_dataset(body.comparison) if body.comparison else None
        async with asyncio.timeout(20):
            async with compute_slots:
                analysis=await run_in_threadpool(analyze,dataset,body.baseline_start,body.baseline_end)
                other=await run_in_threadpool(analyze,second,body.baseline_start,body.baseline_end) if second else None
        matched=compare(dataset,second,analysis,other) if second else None
        bundle=ResearchResult(dataset=dataset,analysis=analysis,comparison_dataset=second,comparison_analysis=other,comparison=matched,
            explanation_mode="deterministic_statistical_rule_based",answer="",generated_at=datetime.now(timezone.utc))
        bundle.answer=answer_question(body.question,bundle)
        return bundle
    except ValueError as e:
        raise HTTPException(422,str(e)) from e
    except PowerError as e:
        raise HTTPException(e.status,str(e),headers={"Retry-After":"30"}) from e
    except TimeoutError as e:
        raise HTTPException(503,"Scientific computation queue timed out; retry shortly.") from e


@router.get("/connectors",response_model=list[ConnectorRecord],operation_id="getResearchConnectors")
def connectors():
    return connector_catalog()


@router.get("/layers",response_model=SpatialCatalog,operation_id="getSpatialLayers")
async def layers():
    try:
        return await layer_catalog()
    except PowerError as e:
        raise HTTPException(e.status,str(e),headers={"Retry-After":"30"}) from e
