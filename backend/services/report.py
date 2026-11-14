"""PDF report for one research result. Pure function of the computed result (no new data)."""
from datetime import timezone
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.research_models import MethodResult, ResearchResult

# The built-in PDF fonts only cover Western European text, so map the few
# scientific symbols the app uses to plain equivalents instead of printing "?".
_SYMBOLS = {"₂": "2", "≥": ">=", "≤": "<=", "−": "-", "≈": "~", "→": "->", "σ": "SD", "‑": "-", "’": "'", "“": '"', "”": '"'}
GREEN = colors.HexColor("#14532d")
GREY = colors.HexColor("#555555")
LANGS = {
    "en": {"title": "Environmental trend report", "summary": "Summary", "results": "Statistical results", "chart": "Annual means",
           "comparison": "Comparison", "answer": "Your question", "caveats": "Methods and caveats", "prov": "Data provenance",
           "disclaimer": "Exploratory statistical analysis of public data. It is not an official assessment and does not establish causes or forecast the future."},
    "fr": {"title": "Rapport sur les tendances environnementales", "summary": "Résumé", "results": "Résultats statistiques", "chart": "Moyennes annuelles",
           "comparison": "Comparaison", "answer": "Votre question", "caveats": "Méthodes et limites", "prov": "Provenance des données",
           "disclaimer": "Analyse statistique exploratoire de données publiques. Ce n'est pas une évaluation officielle et elle n'établit pas de causes ni de prévisions."},
    "sw": {"title": "Ripoti ya mwenendo wa mazingira", "summary": "Muhtasari", "results": "Matokeo ya takwimu", "chart": "Wastani wa kila mwaka",
           "comparison": "Ulinganisho", "answer": "Swali lako", "caveats": "Mbinu na mapungufu", "prov": "Chanzo cha data",
           "disclaimer": "Uchambuzi wa takwimu wa awali wa data ya umma. Si tathmini rasmi na hauthibitishi sababu wala kutabiri siku zijazo."},
    "lg": {"title": "Alipoota ku nkyukakyuka y'obutonde", "summary": "Ebikulu", "results": "Ebivudde mu kubala", "chart": "Ekigero ky'omwaka",
           "comparison": "Okugeraageranya", "answer": "Ekibuuzo kyo", "caveats": "Enkola n'obuzibu", "prov": "Ensibuko y'ebiwandiiko",
           "disclaimer": "Okwekenneenya okw'olubereberye kw'ebiwandiiko by'olukale. Si kwekenneenya kwa gavumenti era tekulaga nsonga wadde okulagula."},
}


def clean(text) -> str:
    text = str(text)
    for k, v in _SYMBOLS.items():
        text = text.replace(k, v)
    return text.encode("cp1252", "replace").decode("cp1252")


def para(text, style):
    return Paragraph(escape(clean(text)), style)


def fmt(x, nd=4):
    return "n/a" if x is None else f"{x:.{nd}g}"


def method_row(m: MethodResult, s):
    est = "n/a" if m.estimate is None else f"{fmt(m.estimate)} {m.unit}".strip()
    ci = "n/a" if m.lower is None or m.upper is None else f"[{fmt(m.lower)}, {fmt(m.upper)}]"
    return [para(m.label, s["cell"]), para(est, s["cell"]), para(ci, s["cell"]), para(fmt(m.p_value, 3), s["cell"]), para(m.status.replace("_", " "), s["cell"])]


def chart(values, unit, width=170 * mm, height=60 * mm):
    pts = [(int(v.period[:4]), v.value) for v in values if v.value is not None]
    if len(pts) < 2:
        return None
    d = Drawing(width, height)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 40, 22, width - 55, height - 34
    lp.data = [pts]
    lp.lines[0].strokeColor = GREEN
    lp.lines[0].strokeWidth = 1.6
    lp.xValueAxis.valueMin, lp.xValueAxis.valueMax = pts[0][0], pts[-1][0]
    span = pts[-1][0] - pts[0][0]
    lp.xValueAxis.valueStep = max(1, round(span / 8))
    ys = [p[1] for p in pts]
    pad = (max(ys) - min(ys)) * 0.1 or 1
    lp.yValueAxis.valueMin, lp.yValueAxis.valueMax = min(ys) - pad, max(ys) + pad
    lp.xValueAxis.labelTextFormat = "%d"
    lp.yValueAxis.labelTextFormat = "%.3g"
    lp.xValueAxis.labels.fontSize = lp.yValueAxis.labels.fontSize = 7
    d.add(lp)
    d.add(String(2, height - 8, clean(unit), fontSize=7, fillColor=GREY))
    return d


def build_report(r: ResearchResult, language: str = "en") -> bytes:
    t = LANGS.get(language, LANGS["en"])
    ss = getSampleStyleSheet()
    s = {
        "title": ParagraphStyle("t", parent=ss["Title"], textColor=GREEN, fontSize=20, alignment=0, spaceAfter=2),
        "sub": ParagraphStyle("sub", parent=ss["Normal"], textColor=GREY, fontSize=9),
        "h": ParagraphStyle("h", parent=ss["Heading2"], textColor=GREEN, fontSize=12, spaceBefore=10, spaceAfter=4),
        "p": ParagraphStyle("p", parent=ss["Normal"], fontSize=9, leading=12),
        "small": ParagraphStyle("sm", parent=ss["Normal"], fontSize=7.5, leading=10, textColor=GREY),
        "cell": ParagraphStyle("c", parent=ss["Normal"], fontSize=8, leading=10),
        "bullet": ParagraphStyle("b", parent=ss["Normal"], fontSize=8.5, leading=11, leftIndent=10, bulletIndent=0),
    }
    d, a = r.dataset, r.analysis
    story = [para("Ecoscope", s["sub"]), para(f"{t['title']}: {d.label}", s["title"]),
             para(f"{d.location} | {d.requested_start} to {d.requested_end}", s["sub"]), Spacer(1, 6)]

    meta = [["Source", d.source], ["Unit", d.unit], ["Frequency", d.frequency], ["Data kind", d.kind.replace("_", " ")],
            ["Coverage", f"{d.valid_count}/{d.expected_count} valid values ({d.coverage_percent:.1f}%)"],
            ["Retrieved", d.retrieved_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if d.retrieved_at else "n/a"],
            ["Report generated", r.generated_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")]]
    mt = Table([[para(k, s["cell"]), para(v, s["cell"])] for k, v in meta], colWidths=[35 * mm, 135 * mm])
    mt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f2"))]))
    story += [mt, para(t["summary"], s["h"])]
    story += [Paragraph(escape(clean(line)), s["bullet"], bulletText="-") for line in a.interpretation]

    rows = [[para(x, s["cell"]) for x in ("Method", "Estimate", "95% interval", "p-value", "Status")]]
    rows += [method_row(m, s) for m in (a.ols, a.sen, a.mann_kendall, a.change_point, a.spi)]
    rt = Table(rows, colWidths=[48 * mm, 40 * mm, 38 * mm, 18 * mm, 26 * mm], repeatRows=1)
    rt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dcfce7")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [para(t["results"], s["h"]), rt]
    story += [Spacer(1, 3)] + [para(f"{m.label}: {m.details}", s["small"]) for m in (a.ols, a.sen, a.mann_kendall, a.change_point, a.spi)]

    figure = chart(a.annual_values, f"{d.unit} (annual mean)")
    if figure is not None:
        story += [KeepTogether([para(t["chart"], s["h"]), figure])]

    if r.comparison and r.comparison_dataset:
        c = r.comparison
        story += [para(t["comparison"], s["h"]),
                  para(f"Compared with: {r.comparison_dataset.location}. Matched periods: {c.matched_count}. Mean difference (first minus second): {fmt(c.mean_difference)} {c.unit}. "
                       f"Pearson {fmt(c.pearson, 3)}, Spearman {fmt(c.spearman, 3)} (on residuals; no causal claim).", s["p"])]
    if r.answer:
        story += [para(t["answer"], s["h"]), para(r.answer, s["p"]),
                  para(f"Explanation mode: {r.explanation_mode.replace('_', ' ')}", s["small"])]

    caveats = list(dict.fromkeys(d.warnings + a.warnings + (r.comparison.warnings if r.comparison else [])))
    story += [para(t["caveats"], s["h"])] + [Paragraph(escape(clean(w)), s["bullet"], bulletText="-") for w in caveats]

    prov = [["Source URL", d.source_url], ["Documentation", d.documentation_url], ["Licence", d.license], ["Attribution", d.attribution],
            ["Spatial scope", f"{d.spatial_scope}; resolution: {d.resolution}"], ["Method version", a.method_version], ["Baseline", a.baseline],
            ["Dataset fingerprint (SHA-256)", d.fingerprint]]
    pt = Table([[para(k, s["cell"]), para(v, s["cell"])] for k, v in prov], colWidths=[40 * mm, 130 * mm])
    pt.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f2")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [para(t["prov"], s["h"]), pt, Spacer(1, 8), para(t["disclaimer"], s["small"])]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GREY)
        canvas.drawString(20 * mm, 10 * mm, "Ecoscope - exploratory analysis of public data")
        canvas.drawRightString(190 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title=clean(f"Ecoscope report: {d.label}"), author="Ecoscope").build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
