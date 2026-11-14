"""Evidence-only deterministic interpretation. Not a generative AI integration."""
from backend.research_models import ResearchResult


def answer_question(question: str, bundle: ResearchResult) -> str:
    q=question.lower().strip();d=bundle.dataset;a=bundle.analysis
    reference=f"[dataset {d.fingerprint[:12]}; {d.source}; {a.window}; method {a.method_version}]"
    if not q:
        return "Statistical/rule-based interpretation. "+" ".join(a.interpretation)+" "+reference
    # Decline causal, forecasting, unrelated and event-attribution requests first.
    if any(word in q for word in ["cause","why","predict","forecast","tomorrow","next year","because","responsible","prove"]):
        return "Unsupported: these retrieved series and exploratory methods cannot establish causation or predict future conditions. I can describe source coverage, units, trends, anomalies, drought calculations or matched comparisons. "+reference
    if any(word in q for word in ["compar","correl","difference between"]):
        c=bundle.comparison
        if not c or not c.matched_count:
            return "Insufficient evidence: no matched comparison has been loaded. "+reference
        return f"Matched comparison: {c.matched_count} periods; left-minus-right mean difference {c.mean_difference:.6g} {c.unit}. Pearson residual correlation {c.pearson if c.pearson is not None else 'unavailable'}; Spearman {c.spearman if c.spearman is not None else 'unavailable'}. {c.method} "+" ".join(c.warnings)+" "+reference
    if any(word in q for word in ["drought","spi"]):
        return f"{a.spi.label}: {a.spi.status}. Latest available computed value: {a.spi.estimate if a.spi.estimate is not None else 'unavailable'}. {a.spi.details} "+reference
    if any(word in q for word in ["trend","slope","warming","cooling","regress","mann","sen"]):
        return " ".join(a.interpretation)+f" {a.mann_kendall.details} "+reference
    if any(word in q for word in ["source","data","cover","unit","resol","station","forest","rain","co2"]):
        return f"{d.label}; {d.kind}; units {d.unit}; {d.valid_count}/{d.expected_count} valid {d.frequency} values; spatial support {d.spatial_scope}: {d.resolution}. "+" ".join(d.warnings)+f" Source: {d.source_url} "+reference
    if any(word in q for word in ["anomal","outlier","season","unusual","change point","break"]):
        flags=sum(v.outlier for v in a.anomalies)
        return f"Baseline {a.baseline}. Isolation Forest screening flagged {flags} monthly residuals; this is an algorithmic screen, not confirmed environmental events. {a.change_point.details} "+" ".join(a.warnings[4:])+" "+reference
    return "Unsupported question: no retrieved/computed evidence was selected that answers this. Ask about this dataset's source, coverage, trend, seasonal anomalies, SPI drought indicator or a loaded comparison. This is a deterministic scientific interpretation mode, not generative AI. "+reference
