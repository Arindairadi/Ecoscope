"""TEST ONLY synthetic series. Fixtures never imported by application code."""
from datetime import datetime,timezone
import json
import math
import numpy as np
import pymannkendall as pmk
import pytest
from fastapi.testclient import TestClient
from scipy import stats
from backend.app import app
from backend.research_models import ResearchSelection,ResearchValue,ResearchInput,FireInput
from backend.services import datasets
from backend.services.datasets import assembled,get_dataset,periods,numeric
from backend.services.research_science import annualize,analyze,mk_test,hac_interval,compare,spi3_values
from backend.services.power import PowerError
from backend.services.explanations import answer_question
from backend.services.fires import parse_fires,validate_fire,fire_detections
from backend.services.connectors import supabase_config
from backend.services.upstream import PublicUpstream
from backend.services.spatial import parse_layers

client=TestClient(app)


def fixture_dataset(*, years=35, annual=False, indicator="T2M",f=None,missing=None):
    s=ResearchSelection(source="worldbank" if annual else "power",indicator="forest" if annual else indicator,start="1990-01",end=f"{1989+years}-12")
    slots=periods(s,annual=annual);values=[]
    for i,p in enumerate(slots):
        y=int(p[:4])-1990;m=int(p[5:]) if not annual else 1
        v=f(y,m) if f else 10+2*y+(0 if annual else np.sin(2*np.pi*m/12))
        values.append(ResearchValue(period=p,value=None if p in (missing or []) else float(v)))
    return assembled(s,values,label="TEST ONLY synthetic series",source="TEST ONLY",source_url="https://example.invalid/test-only",
        docs="https://example.invalid/test-only",unit="% land area" if annual else "mm/day" if indicator=="PRECTOTCORR" else "°C",
        kind="test_only",scope="national" if annual else "point_grid",resolution="TEST ONLY",location="TEST ONLY",
        attribution="TEST ONLY",license="TEST ONLY",retrieved=datetime(2026,1,1,tzinfo=timezone.utc),warnings=["TEST ONLY"],annual=annual)


def test_known_linear_annual_slope_and_units():
    d=fixture_dataset();a=analyze(d,1991,2020)
    assert a.ols.estimate==pytest.approx(2)
    assert a.sen.estimate==pytest.approx(2)
    assert a.ols.unit=="°C/year"
    assert a.ols.lower==pytest.approx(2)
    assert a.ols.upper==pytest.approx(2)
    assert len(a.annual_values)==35


@pytest.mark.parametrize("values", [
    list(range(20)),list(range(20,0,-1)),[1]*20,
    [1,1,3,2,5,5,4,6,8,7,9,10,10,12,11,13,14,15,15,16],
])
def test_mk_against_pymannkendall_reference(values):
    tau,p,score=mk_test(values);reference=pmk.original_test(values)
    assert tau==pytest.approx(reference.Tau)
    assert p==pytest.approx(reference.p)
    assert score==reference.s


def test_hac_interval_against_statsmodels_reference():
    import statsmodels.api as sm
    from statsmodels.stats.sandwich_covariance import cov_hac
    rng=np.random.default_rng(42);x=np.arange(1980,2020,dtype=float)
    noise=rng.normal(size=len(x));noise[1:]+=.5*noise[:-1]
    y=.13*(x-1980)+noise
    fit=stats.linregress(x,y)
    low,high,lag=hac_interval(x,y,fit.slope,fit.intercept)
    model=sm.OLS(y,sm.add_constant(x-x.mean())).fit()
    covariance=cov_hac(model,nlags=lag,use_correction=True)
    half=stats.t.ppf(.975,len(y)-2)*np.sqrt(covariance[1,1])
    assert low==pytest.approx(fit.slope-half,rel=1e-9)
    assert high==pytest.approx(fit.slope+half,rel=1e-9)


def test_missing_month_excludes_annual_mean_without_imputing():
    d=fixture_dataset(missing=["2000-03","2000-04"])
    annual=annualize(d)
    assert len(annual)==34
    assert "2000" not in [v.period for v in annual]
    a=analyze(d,1991,2020)
    assert a.mann_kendall.p_value is None  # irregular annual spacing
    assert next(v for v in a.anomalies if v.period=="2000-03").difference is None


def test_minimum_sample_baseline_constant_and_no_fake_outliers():
    a=analyze(fixture_dataset(years=8),1991,1997)
    assert a.ols.estimate is None
    assert all(v.z_score is None and not v.outlier for v in a.anomalies)
    constant=analyze(fixture_dataset(f=lambda y,m:1),1991,2020)
    assert constant.mann_kendall.estimate==0
    assert all(v.z_score is None and not v.outlier for v in constant.anomalies)


def test_seasonality_known_pattern_and_anomaly_units():
    d=fixture_dataset(f=lambda y,m:m)
    a=analyze(d,1991,2020)
    assert [m.mean for m in a.seasonality]==list(range(1,13))
    assert all(v.difference==0 and v.z_score is None for v in a.anomalies)


def test_isolation_forest_reproducible_with_explained_settings():
    d=fixture_dataset(f=lambda y,m:10+np.sin(y*2.3)+np.cos(m)+(.1*y)+(100 if y==30 and m==6 else 0))
    a=analyze(d,1991,2020);b=analyze(d,1991,2020)
    assert [v.score for v in a.anomalies]==[v.score for v in b.anomalies]
    assert next(v for v in a.anomalies if v.period=="2020-06").outlier
    assert any("contamination 0.05" in w for w in a.warnings)


def test_pettitt_known_step_and_confounded_p_suppression():
    d=fixture_dataset(annual=True,years=30,f=lambda y,m:0 if y<15 else 10)
    a=analyze(d,1991,2019)
    assert a.change_point.estimate==2004
    assert a.change_point.p_value is None
    assert a.change_point.status=="candidate_only"


def test_sen_uses_actual_irregular_years_not_row_index():
    d=fixture_dataset(annual=True,missing=["1995","1998","2005"])
    a=analyze(d,1991,2020)
    assert a.sen.estimate==pytest.approx(2)


def test_spi_monthly_totals_and_reference_probability_transform():
    d=fixture_dataset(indicator="PRECTOTCORR",f=lambda y,m:1+((y*7+m*3)%31)/8)
    values,method=spi3_values(d,1991,2020)
    assert method.status=="computed"
    # Independently reconstruct a July 3-month total and gamma/normal transform.
    import calendar
    amounts={v.period:v.value*calendar.monthrange(int(v.period[:4]),int(v.period[5:]))[1] for v in d.values}
    baseline=np.array([sum(amounts[f"{y}-{m:02d}"] for m in [5,6,7]) for y in range(1991,2021)])
    shape,loc,scale=stats.gamma.fit(baseline,floc=0)
    actual=sum(amounts[f"2024-{m:02d}"] for m in [5,6,7])
    expected=stats.norm.ppf(stats.gamma.cdf(actual,shape,loc=loc,scale=scale))
    assert values["2024-07"]==pytest.approx(expected)
    assert "1990-01" not in values and "1990-02" not in values
    assert len(values)>400


def test_spi_missing_gaps_zero_and_short_baselines():
    d=fixture_dataset(indicator="PRECTOTCORR",missing=["2024-01"],f=lambda y,m:0 if y%8==0 else 1+y%7+m/10)
    values,_=spi3_values(d,1991,2020)
    assert all(f"2024-{m:02d}" not in values for m in [1,2,3])
    assert all(math.isfinite(v) for v in values.values())
    assert spi3_values(d,2000,2020)[0]=={}
    assert spi3_values(fixture_dataset(indicator="PRECTOTCORR",f=lambda y,m:0),1991,2020)[0]=={}


def test_matched_comparison_missing_and_no_spurious_constant_residual_correlation():
    a=fixture_dataset(missing=["2000-01"]);b=fixture_dataset(f=lambda y,m:12+2*y+np.sin(2*np.pi*m/12))
    aa,ba=analyze(a,1991,2020),analyze(b,1991,2020)
    c=compare(a,b,aa,ba)
    assert c.matched_count==419
    assert c.mean_difference==pytest.approx(-2)
    assert c.pearson is None and c.spearman is None
    b.unit="wrong"
    with pytest.raises(ValueError): compare(a,b,aa,ba)


def test_unknown_and_causal_questions_are_declined(monkeypatch):
    d=fixture_dataset()
    async def fake(_): return d
    monkeypatch.setattr("backend.research_routes.get_dataset",fake)
    body={"selection":d.selection.model_dump(),"baseline_start":1991,"baseline_end":2020,"question":"Why did humans cause this warming?"}
    r=client.post("/api/research/run",json=body)
    assert r.status_code==200
    assert r.json()["answer"].startswith("Unsupported:")
    assert r.json()["explanation_mode"]=="deterministic_statistical_rule_based"
    assert d.fingerprint[:12] in r.json()["answer"]
    body["question"]="Who won the football game?"
    assert "Unsupported question" in client.post("/api/research/run",json=body).json()["answer"]


@pytest.mark.parametrize("change",[
    {"latitude":91},{"longitude":-181},{"latitude":"NaN"},{"source":"http://evil.invalid"},
    {"start":"1991-13"},{"start":"2020-01","end":"2019-12"},{"start":"1900-01"},
    {"start":"1981-01","end":"2099-12"},{"start":"1981-01","end":"2032-01"},
])
def test_invalid_inputs_do_not_call_upstream(change,monkeypatch):
    called=[]
    async def fake(*a,**k): called.append(True);raise AssertionError
    monkeypatch.setattr(datasets.public_upstream,"get",fake)
    s=fixture_dataset().selection.model_dump();s.update(change)
    r=client.post("/api/research/run",json={"selection":s,"baseline_start":1991,"baseline_end":2020})
    assert r.status_code==422
    assert not called


@pytest.mark.parametrize("status",[502,503,504])
def test_upstream_failures_remain_errors_no_fixture_fallback(status,monkeypatch):
    async def fake(*a,**k): raise PowerError("TEST ONLY outage",status)
    monkeypatch.setattr("backend.research_routes.get_dataset",fake)
    r=client.post("/api/research/run",json={"selection":fixture_dataset().selection.model_dump(),"baseline_start":1991,"baseline_end":2020})
    assert r.status_code==status
    assert "dataset" not in r.json()
    assert r.headers["retry-after"]=="30"


def test_public_power_precip_metadata_missing_annual_and_zero(monkeypatch):
    payload={"header":{"sources":["MERRA2","POWER"],"fill_value":-999,"api":{"version":"TEST ONLY"},"time_standard":"LST"},
             "parameters":{"PRECTOTCORR":{"units":"mm/day","longname":"Precipitation Corrected"}},
             "properties":{"parameter":{"PRECTOTCORR":{"202001":0,"202002":-999,"202003":2,"202013":1000}}}}
    async def fake(*a,**k):return json.dumps(payload).encode(),datetime.now(timezone.utc)
    monkeypatch.setattr(datasets.public_upstream,"get",fake)
    import asyncio
    s=ResearchSelection(indicator="PRECTOTCORR",start="2020-01",end="2020-12")
    d=asyncio.run(get_dataset(s))
    assert [v.value for v in d.values[:3]]==[0,None,2]
    assert len(d.values)==12 and d.valid_count==2
    payload["parameters"]["PRECTOTCORR"]["units"]="inches"
    with pytest.raises(PowerError):asyncio.run(get_dataset(s))


def test_noaa_and_national_forest_fixture_parsing(monkeypatch):
    import asyncio
    async def noaa(*a,**k):
        return b"# TEST ONLY\nyear,month,average,average_unc\n2020,1,410.0,0.1\n2020,2,-99.99,-99.99\n",datetime.now(timezone.utc)
    monkeypatch.setattr(datasets.public_upstream,"get",noaa)
    d=asyncio.run(get_dataset(ResearchSelection(source="noaa",indicator="co2",start="2020-01",end="2020-03")))
    assert d.spatial_scope=="global_marine_surface" and [v.value for v in d.values]==[410,None,None]
    data=[{"pages":1},[{"indicator":{"id":"AG.LND.FRST.ZS"},"countryiso3code":"UGA","country":{"value":"TEST ONLY Uganda"},"date":"2020","value":12.3}]]
    async def forest(*a,**k):return json.dumps(data).encode(),datetime.now(timezone.utc)
    monkeypatch.setattr(datasets.public_upstream,"get",forest)
    d=asyncio.run(get_dataset(ResearchSelection(source="worldbank",indicator="forest",start="2020-01",end="2020-12")))
    assert d.spatial_scope=="national" and d.frequency=="annual" and d.values[0].value==12.3
    with pytest.raises(ValueError):asyncio.run(get_dataset(ResearchSelection(source="worldbank",indicator="forest",country="WLD")))


def test_fire_csv_is_actual_bbox_filtered_and_no_global_fire_claim():
    raw=b"latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n0.5,32,2024-01-01,0510,T,75,12\n50,80,2024-01-01,1200,A,40,5\n"
    r=parse_fires(raw,FireInput(),datetime.now(timezone.utc),"https://example.invalid/test-only")
    assert r.returned_count==r.count_in_bbox==1
    assert r.features[0].frp_mw==12
    assert r.features[0].acquired.endswith("+00:00")
    assert any("NOT unique fires" in w for w in r.warnings)
    with pytest.raises(ValueError):validate_fire(FireInput(west=-180,east=180))
    with pytest.raises(ValueError):validate_fire(FireInput(date="2020-01-01"))
    with pytest.raises(PowerError):parse_fires(b"wrong,data\n1,2",FireInput(),datetime.now(timezone.utc),"")


def test_firms_optional_secrets_never_leak(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY",raising=False)
    r=client.post("/api/research/fires",json={"source":"firms_viirs"})
    assert r.status_code==503 and "FIRMS_MAP_KEY" in r.json()["detail"]
    monkeypatch.setenv("FIRMS_MAP_KEY","TEST_ONLY_NOT_A_REAL_SECRET")
    raw=b"latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n"
    async def fake(*a,**k):return raw,datetime.now(timezone.utc)
    monkeypatch.setattr("backend.services.fires.public_upstream.get",fake)
    r=client.post("/api/research/fires",json={"source":"firms_viirs"})
    assert r.status_code==200
    assert "TEST_ONLY_NOT_A_REAL_SECRET" not in r.text


def test_supabase_configuration_never_claims_connection(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL",raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY",raising=False)
    assert supabase_config()[0]=="credentials_missing"
    monkeypatch.setenv("SUPABASE_URL","http://localhost:5432")
    monkeypatch.setenv("SUPABASE_ANON_KEY","TEST_ONLY_FAKE"*4)
    assert supabase_config()[0]=="invalid_configuration"
    monkeypatch.setenv("SUPABASE_URL","https://test-only-project.supabase.co")
    assert supabase_config()[0]=="configured_unverified"
    assert "TEST_ONLY_FAKE" not in client.get("/api/research/connectors").text


def test_upstream_rejects_arbitrary_urls_without_network():
    import asyncio
    for url in ["http://gml.noaa.gov/a","https://localhost/a","https://evil.invalid/a","https://user@gml.noaa.gov/a","https://gml.noaa.gov:444/a"]:
        with pytest.raises(ValueError):asyncio.run(PublicUpstream().get(url))


def test_malformed_spatial_capabilities_not_fake_layers():
    with pytest.raises(PowerError):parse_layers(b"<bad>",datetime.now(timezone.utc))
