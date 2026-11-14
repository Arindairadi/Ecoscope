"""Reproducible exploratory statistics. No causal claims or data imputation."""
import calendar
from collections import defaultdict
import math
import numpy as np
from scipy import stats
from sklearn.ensemble import IsolationForest
from backend.research_models import (
    AnalysisResult, AnomalyValue, ComparisonResult, ComparisonRow, MethodResult,
    ResearchDataset, ResearchValue, SeasonalMonth,
)

VERSION = "ecoscope-science-1.0"


def result(label, details, *, status="insufficient_data", **kwargs):
    return MethodResult(label=label, details=details, status=status, **kwargs)


def annualize(d: ResearchDataset):
    if d.frequency == "annual":
        return [v for v in d.values if v.value is not None]
    groups=defaultdict(dict)
    for v in d.values:
        if v.value is not None:
            groups[v.period[:4]][int(v.period[5:])]=v.value
    return [ResearchValue(period=y,value=float(np.mean(list(months.values()))))
            for y,months in sorted(groups.items()) if len(months)==12]


def lag1(values):
    a=np.asarray(values,dtype=float)
    if len(a)<4 or np.std(a[:-1])<1e-10 or np.std(a[1:])<1e-10:
        return 0.0
    return float(np.corrcoef(a[:-1],a[1:])[0,1])


def mk_test(y):
    """Tie-corrected original MK with continuity-corrected normal approximation."""
    y=np.asarray(y,dtype=float);n=len(y)
    score=int(sum(np.sign(y[i+1:]-y[i]).sum() for i in range(n-1)))
    _,ties=np.unique(y,return_counts=True)
    variance=(n*(n-1)*(2*n+5)-sum(t*(t-1)*(2*t+5) for t in ties))/18
    z=(score-np.sign(score))/np.sqrt(variance) if variance>0 else 0.0
    return score/(n*(n-1)/2), float(2*stats.norm.sf(abs(z))), score


def hac_interval(x,y,slope,intercept):
    """Small-sample corrected Newey-West sandwich; Bartlett lag floor n^(1/3)."""
    n=len(y);X=np.column_stack((np.ones(n),x-np.mean(x)))
    residual=np.asarray(y)-(intercept+slope*np.asarray(x))
    scores=X*residual[:,None];meat=scores.T@scores
    lag=min(n-3,max(1,int(n**(1/3))))
    for k in range(1,lag+1):
        cross=scores[k:].T@scores[:-k]
        meat+=(1-k/(lag+1))*(cross+cross.T)
    bread=np.linalg.inv(X.T@X)
    var=(bread@meat@bread)[1,1]*n/(n-2)
    delta=float(stats.t.ppf(.975,n-2)*np.sqrt(max(0,var)))
    return float(slope-delta),float(slope+delta),lag


def trend_methods(annual, unit):
    n=len(annual);u=f"{unit}/year"
    names=["Linear regression","Sen slope","Mann–Kendall (annual)","Pettitt change-point screen"]
    if n<10:
        return tuple(result(name,"At least 10 complete annual values are required; missing months are not filled.",unit=u if i<2 else "")
                     for i,name in enumerate(names))
    x=np.asarray([int(v.period) for v in annual],dtype=float)
    y=np.asarray([v.value for v in annual],dtype=float)
    fit=stats.linregress(x,y);slope=float(fit.slope)
    low,high,lag=hac_interval(x,y,slope,float(fit.intercept))
    residual=y-(fit.intercept+slope*x);ac=lag1(residual);raw_ac=lag1(y);cutoff=1.96/np.sqrt(n)
    dependent=abs(ac)>cutoff or bool(np.any(np.diff(x)!=1))
    ols=result(names[0],f"OLS on complete annual means, actual calendar years. Approximate 95% Newey–West HAC interval, Bartlett lag {lag}, t correction. Exploratory, especially with small samples; no causal interpretation.",
               status="computed",estimate=slope,unit=u,lower=low,upper=high)
    sen=stats.theilslopes(y,x,alpha=.95)
    sm=result(names[1],"Median of pairwise slopes on actual years. SciPy Theil–Sen 95% interval assumes independent errors; not autocorrelation-adjusted. Descriptive magnitude, not proof of a trend.",
              status="computed",estimate=float(sen.slope),unit=u,lower=float(sen.low_slope),upper=float(sen.high_slope))
    tau,p,_=mk_test(y)
    mk=result(names[2],f"Tie/continuity corrections. Seasonality treated using complete annual means, not naive monthly testing. Residual annual lag-1 correlation {ac:.3f}; screening threshold {cutoff:.3f}. IID p-value suppressed for detected dependence or irregular annual spacing; no silent prewhitening.",
              status="descriptive_only" if dependent else "computed",estimate=tau,unit="Kendall tau",p_value=None if dependent else p)
    ranks=stats.rankdata(y);k=np.arange(1,n+1);U=2*np.cumsum(ranks)-k*(n+1)
    candidates=np.arange(4,n-5+1)
    index=int(candidates[np.argmax(np.abs(U[candidates]))])
    K=float(abs(U[index]));cp=min(1.0,2*math.exp(-6*K*K/(n**3+n*n)))
    suppress=dependent or abs(raw_ac)>cutoff or p<.05
    change=result(names[3],f"Candidate split after {int(x[index])}; ≥5 years each side. Pettitt rank statistic K={K:.3f}. Smooth drift and dependence can mimic a break. Not a confirmed physical regime change. IID p-value suppressed under drift/dependence.",
                  status="candidate_only",estimate=float(x[index]),unit="candidate split year",p_value=None if suppress else cp)
    eligible=sorted([m for m in (mk,change) if m.p_value is not None],key=lambda m:m.p_value)
    previous=0.0
    for i,m in enumerate(eligible):
        m.p_value=min(1.0,max(previous,m.p_value*(len(eligible)-i)));previous=m.p_value
        m.details+=" Displayed p-value Holm-adjusted across eligible MK/Pettitt tests in this run only; not across other locations/indicators/repeated runs."
    return ols,sm,mk,change


def spi3_values(d, baseline_start, baseline_end):
    """WMO mixed-zero gamma SPI-3, calibrated separately by ending month."""
    if d.id!="power:PRECTOTCORR":
        return {},result("SPI-3","Only applicable to monthly precipitation. Rainfall alone is not a drought index.",status="not_applicable")
    points=d.values;accum={}
    for i in range(2,len(points)):
        part=points[i-2:i+1];dates=[int(v.period[:4])*12+int(v.period[5:]) for v in part]
        if dates[2]-dates[1]!=1 or dates[1]-dates[0]!=1 or any(v.value is None or v.value<0 for v in part):
            continue
        accum[part[-1].period]=sum(v.value*calendar.monthrange(int(v.period[:4]),int(v.period[5:]))[1] for v in part)
    output={};bad=[];poor=[]
    if baseline_end-baseline_start+1<30:
        return {},result("SPI-3","Requires ≥30 baseline years and preceding accumulation months. No short-baseline SPI is fabricated.")
    for month in range(1,13):
        sample=np.array([v for p,v in accum.items() if baseline_start<=int(p[:4])<=baseline_end and int(p[5:])==month])
        positive=sample[sample>0]
        if len(sample)<30 or len(positive)<20 or len(np.unique(positive))<3:
            bad.append(month);continue
        try:
            a,_,scale=stats.gamma.fit(positive,floc=0);q=float(np.mean(sample==0))
            if stats.kstest(positive,"gamma",args=(a,0,scale)).statistic>.2: poor.append(month)
            for p,v in accum.items():
                if int(p[5:])==month:
                    prob=q+(1-q)*stats.gamma.cdf(v,a,loc=0,scale=scale)
                    output[p]=float(stats.norm.ppf(np.clip(prob,1e-10,1-1e-10)))
        except (ValueError,FloatingPointError):
            bad.append(month)
    last=next((output[v.period] for v in reversed(points) if v.period in output),None)
    detail=("3 consecutive calendar-month estimated totals, POWER mm/day × days/month. Calendar-month gamma MLE (location 0), zero probability mass and normal transform; probabilities clipped 1e-10…1−1e-10. "
            f"Calibration {baseline_start}–{baseline_end}; each ending month needs ≥30 totals, ≥20 positive and ≥3 distinct. "
            "Model-derived meteorological precipitation deficit, not agricultural/hydrological drought or official warning. Stationarity/distribution and calibration uncertainty remain; no confidence bounds. "
            f"Uncalibrated months: {bad or 'none'}. Large empirical gamma-CDF discrepancies (>0.2, diagnostic, not a post-fit KS significance test): {poor or 'none'}.")
    return output,result("SPI-3",detail,status="computed" if output else "insufficient_data",estimate=last,unit="standard deviations")


def analyze(d: ResearchDataset, baseline_start: int, baseline_end: int) -> AnalysisResult:
    if baseline_start>baseline_end or baseline_start<int(d.requested_start[:4]) or baseline_end>int(d.requested_end[:4]):
        raise ValueError("Baseline years must be ordered and inside the requested data window.")
    annual=annualize(d);ols,sen,mk,change=trend_methods(annual,d.unit)
    seasonality=[];anomalies=[];climatology={}
    if d.frequency=="monthly":
        for month in range(1,13):
            numbers=[v.value for v in d.values if v.value is not None and int(v.period[5:])==month and baseline_start<=int(v.period[:4])<=baseline_end]
            mean=float(np.mean(numbers)) if len(numbers)>=10 else None
            std=float(np.std(numbers,ddof=1)) if len(numbers)>=10 else None
            climatology[month]=(mean,std);seasonality.append(SeasonalMonth(month=month,count=len(numbers),mean=mean,std=std))
        spi,spi_result=spi3_values(d,baseline_start,baseline_end)
        for v in d.values:
            mean,std=climatology[int(v.period[5:])]
            diff=v.value-mean if v.value is not None and mean is not None else None
            z=diff/std if diff is not None and std is not None and std>1e-10 else None
            anomalies.append(AnomalyValue(period=v.period,difference=diff,z_score=z,outlier=False,score=None,spi3=spi.get(v.period)))
        eligible=[v for v in anomalies if v.z_score is not None]
        if len(eligible)>=120 and all(m.count>=10 for m in seasonality):
            x=np.array([int(v.period[:4])+(int(v.period[5:])-1)/12 for v in eligible])
            y=np.array([v.z_score for v in eligible]);fit=stats.linregress(x,y)
            residual=(y-(fit.intercept+fit.slope*x)).reshape(-1,1)
            model=IsolationForest(n_estimators=200,contamination=.05,max_samples=min(256,len(y)),random_state=42,n_jobs=1)
            labels=model.fit_predict(residual);scores=model.decision_function(residual)
            for v,label,score in zip(eligible,labels,scores):
                v.outlier=bool(label==-1);v.score=float(score)
    else:
        spi_result=result("SPI-3","Annual forest stocks are not precipitation.",status="not_applicable")
    warnings=[
        "Exploratory analysis: no attribution, causation or forecast.",
        "Monthly-source annual means use all 12 valid months, equally weighted; gaps not imputed. Complete years at range edges only.",
        "HAC intervals are approximate; Sen intervals assume independent errors. Autocorrelation screening does not establish independence.",
        "P-values are adjusted within this run only, not repeated exploration across locations/indicators. No automatic significance claim.",
        "Seasonal anomalies need ≥10 valid baseline values each month. A baseline under 30 years is provisional, not a WMO climatological normal.",
        "Isolation Forest: detrended seasonal z-score residuals, 200 trees, contamination 0.05, seed 42, max_samples=min(256,n), ≥120 eligible months and ≥10 baseline values each month. Chosen 5% screening setting is not a discovered event rate/probability. Same-window training/screening, not predictive validation.",
    ]
    if d.frequency=="monthly" and any(v.count<10 for v in seasonality):
        warnings.append("Seasonal baseline insufficient for one or more months; corresponding anomalies and all Isolation Forest screening unavailable.")
    interpretation=[f"Evidence: {d.valid_count}/{d.expected_count} valid {d.frequency} values ({d.coverage_percent:.1f}%) for {d.location}, {d.requested_start} to {d.requested_end}.",
                    f"Trend evidence uses {len(annual)} complete annual values, not monthly samples as independent years."]
    if ols.estimate is not None:
        interpretation.append(f"Linear slope {ols.estimate:.6g} {ols.unit}; approximate HAC 95% interval [{ols.lower:.6g}, {ols.upper:.6g}]. Sen slope {sen.estimate:.6g} {sen.unit}. Statistical descriptions, not causal findings.")
    else:
        interpretation.append("Insufficient complete annual values for configured trend methods.")
    return AnalysisResult(status="computed" if annual else "insufficient_data",method_version=VERSION,window=f"{d.requested_start} to {d.requested_end}",
        baseline=f"{baseline_start}–{baseline_end}",n=d.valid_count,complete_years=len(annual),coverage_percent=d.coverage_percent,annual_values=annual,
        ols=ols,sen=sen,mann_kendall=mk,change_point=change,spi=spi_result,seasonality=seasonality,anomalies=anomalies,warnings=warnings,interpretation=interpretation)


def compare(a: ResearchDataset,b: ResearchDataset,aa: AnalysisResult,ba: AnalysisResult):
    if a.id!=b.id or a.unit!=b.unit or a.frequency!=b.frequency:
        raise ValueError("Compare only the same source, indicator, units and frequency.")
    if (a.requested_start,a.requested_end)!=(b.requested_start,b.requested_end):
        raise ValueError("Comparison needs the same requested period.")
    if a.spatial_scope=="global_marine_surface":
        raise ValueError("NOAA global CO₂ does not support point-specific comparison.")
    right={v.period:v.value for v in b.values if v.value is not None}
    rows=[ComparisonRow(period=v.period,left=v.value,right=right[v.period],difference=v.value-right[v.period]) for v in a.values if v.value is not None and v.period in right]
    if a.frequency=="monthly":
        left={v.period:v.difference for v in aa.anomalies if v.difference is not None}
        other={v.period:v.difference for v in ba.anomalies if v.difference is not None};need=36
    else:
        left={v.period:v.value for v in a.values if v.value is not None};other=right;need=10
    keys=sorted(left.keys()&other.keys());pearson=spearman=None
    if len(keys)>=need:
        x=np.array([int(k[:4])+(int(k[5:])-1)/12 if len(k)>4 else int(k) for k in keys])
        y=np.array([left[k] for k in keys]);z=np.array([other[k] for k in keys])
        # Joint time+month fixed effects prevent different missing baseline
        # months from leaving a shared artificial seasonal residual.
        design=np.column_stack([np.ones(len(x)),x-np.mean(x)] +
            ([np.array([int(k[5:])==m for k in keys],dtype=float) for m in range(2,13)]
             if a.frequency=="monthly" else []))
        for values in (y,z):
            values-=design@np.linalg.lstsq(design,values,rcond=None)[0]
        if min(np.std(y),np.std(z))>1e-10:
            pearson=float(stats.pearsonr(y,z).statistic);spearman=float(stats.spearmanr(y,z).statistic)
    return ComparisonResult(status="computed" if rows else "no_overlap",matched_count=len(rows),mean_difference=float(np.mean([v.difference for v in rows])) if rows else None,
        unit=a.unit,pearson=pearson,spearman=spearman,values=rows,
        method=f"Exact period intersection; left minus right. Correlations on residuals after joint linear-time {'and calendar-month fixed effects on seasonal anomalies' if a.frequency=='monthly' else 'regression on annual values'}, using actual dates; ≥{need} eligible pairs.",
        warnings=["No correlation p-value or causal claim. Serial/spatial dependence, shared grid cells and repeated exploration can inflate association.",
                  "Mean differences use matched valid periods only, missing excluded pairwise, never zero.",
                  "Correlation unavailable for insufficient pairs, inadequate baseline or near-constant residuals."])
