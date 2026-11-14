import type { AnalysisResult, MethodResult, ResearchDataset, ResearchInput, ResearchResult } from "@workspace/api-client-react";

export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:" ? p.href : null; } catch { return null; }
}

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.replace(/[^\w.-]+/g, "_");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Numbers are written verbatim; strings are neutralised against spreadsheet formula injection. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function datasetCsv(ds: ResearchDataset): string {
  const meta = [
    ["# dataset", ds.label], ["# source", ds.source], ["# location", ds.location], ["# unit", ds.unit],
    ["# frequency", ds.frequency], ["# retrieved_at", ds.retrieved_at ?? ""], ["# fingerprint_sha256", ds.fingerprint],
    ["# license", ds.license], ["# attribution", ds.attribution], ["# source_url", ds.source_url],
    ["# requested", `${ds.requested_start} to ${ds.requested_end}`],
    ["# available", `${ds.available_start ?? "none"} to ${ds.available_end ?? "none"}`],
    ["# spatial_scope", ds.spatial_scope], ["# resolution", ds.resolution], ["# kind", ds.kind],
    ["# coverage_percent", ds.coverage_percent], ["# documentation", ds.documentation_url],
    ["# warnings", ds.warnings.join(" | ")],
  ];
  const rows = [["period", "value", "uncertainty", "unit"], ...ds.values.map((v) => [v.period, v.value, v.uncertainty, ds.unit])];
  return [...meta, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function datasetJson(ds: ResearchDataset) {
  return JSON.stringify({ exported_by: "Ecoscope", exported_at: new Date().toISOString(), dataset: ds }, null, 2);
}

export function bundleJson(input: ResearchInput, r: ResearchResult) {
  return JSON.stringify({
    format: "ecoscope.research.bundle", format_version: 1, exported_at: new Date().toISOString(),
    note: "Reproduce by POSTing request to /api/research/run. Values are exactly as returned by the server; nothing was altered client-side.",
    request: input, result: r,
  }, null, 2);
}

/** Clone a rendered chart SVG, resolve CSS variables to concrete colors, strip anything executable. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*");
  const dst = clone.querySelectorAll("*");
  src.forEach((el, i) => {
    const d = dst[i]; if (!d) return;
    const cs = getComputedStyle(el);
    for (const attr of ["fill", "stroke", "stop-color"]) {
      const a = d.getAttribute(attr);
      if (a && a.includes("var(")) d.setAttribute(attr, cs.getPropertyValue(attr) || "currentColor");
    }
  });
  clone.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  clone.querySelectorAll("*").forEach((n) => {
    for (const a of Array.from(n.attributes)) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !a.value.startsWith("#"))) n.removeAttribute(a.name);
    }
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const bg = getComputedStyle(document.body).backgroundColor;
  const w = svg.clientWidth || Number(svg.getAttribute("width")) || 800;
  const h = svg.clientHeight || Number(svg.getAttribute("height")) || 300;
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "100%"); rect.setAttribute("height", "100%"); rect.setAttribute("fill", bg);
  clone.insertBefore(rect, clone.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

const f = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? "not available" : n.toFixed(d));

function methodRow(m: MethodResult) {
  const ci = m.lower !== null && m.upper !== null ? `${f(m.lower)} to ${f(m.upper)}` : "not available";
  return `<tr><td>${esc(m.label)}</td><td>${esc(m.status)}</td><td>${esc(f(m.estimate))} ${esc(m.estimate !== null ? m.unit : "")}</td><td>${esc(ci)}</td><td>${esc(m.p_value === null ? "not reported" : f(m.p_value, 4))}</td><td>${esc(m.details)}</td></tr>`;
}

function link(u: string, label: string) {
  const s = safeUrl(u);
  return s ? `<a href="${esc(s)}" rel="noreferrer">${esc(label)}</a>` : `${esc(label)} (unsafe or missing URL omitted)`;
}

function dsSection(title: string, ds: ResearchDataset, a: AnalysisResult) {
  const list = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>None reported.</p>");
  return `<section><h2>${esc(title)}: ${esc(ds.label)}</h2>
<table class="kv"><tbody>
<tr><th>Source</th><td>${esc(ds.source)}</td></tr><tr><th>Location / scope</th><td>${esc(ds.location)} &middot; ${esc(ds.spatial_scope)}</td></tr>
<tr><th>Resolution</th><td>${esc(ds.resolution)}</td></tr><tr><th>Kind</th><td>${esc(ds.kind)}</td></tr>
<tr><th>Unit / frequency</th><td>${esc(ds.unit)} &middot; ${esc(ds.frequency)}</td></tr>
<tr><th>Requested</th><td>${esc(ds.requested_start)} to ${esc(ds.requested_end)}</td></tr>
<tr><th>Available</th><td>${esc(ds.available_start ?? "none")} to ${esc(ds.available_end ?? "none")}</td></tr>
<tr><th>Coverage</th><td>${esc(ds.valid_count)} of ${esc(ds.expected_count)} (${esc(ds.coverage_percent.toFixed(1))}%)</td></tr>
<tr><th>Retrieved</th><td>${esc(ds.retrieved_at ?? "not reported")}</td></tr>
<tr><th>SHA-256 fingerprint</th><td><code>${esc(ds.fingerprint)}</code></td></tr>
<tr><th>License</th><td>${esc(ds.license)}</td></tr><tr><th>Attribution</th><td>${esc(ds.attribution)}</td></tr>
<tr><th>Links</th><td>${link(ds.source_url, "Source request")} &middot; ${link(ds.documentation_url, "Documentation")}</td></tr>
</tbody></table>
<h3>Dataset warnings</h3>${list(ds.warnings)}
<h3>Analysis (${esc(a.method_version)}, status ${esc(a.status)})</h3>
<p>Window ${esc(a.window)} &middot; baseline ${esc(a.baseline)} &middot; n=${esc(a.n)} &middot; complete years ${esc(a.complete_years)} &middot; coverage ${esc(a.coverage_percent.toFixed(1))}%</p>
<table><thead><tr><th>Method</th><th>Status</th><th>Estimate</th><th>95% interval</th><th>p-value</th><th>Details and limits</th></tr></thead><tbody>
${[a.ols, a.sen, a.mann_kendall, a.change_point, a.spi].map(methodRow).join("")}</tbody></table>
<h3>Interpretation (rule-based)</h3>${list(a.interpretation)}
<h3>Analysis warnings and limitations</h3>${list(a.warnings)}
<h3>Annual values</h3><table><thead><tr><th>Year</th><th>Value (${esc(ds.unit)})</th></tr></thead><tbody>${a.annual_values.map((v) => `<tr><td>${esc(v.period)}</td><td>${esc(v.value === null ? "gap" : v.value)}</td></tr>`).join("")}</tbody></table>
</section>`;
}

export function reportHtml(input: ResearchInput, r: ResearchResult): string {
  const c = r.comparison;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Ecoscope research report</title>
<style>body{font:14px/1.5 Georgia,serif;color:#1d2a30;background:#f6f3ee;max-width:960px;margin:0 auto;padding:32px}h1{font-size:28px;margin:0}h2{border-top:2px solid #1d5a60;padding-top:12px;margin-top:32px}table{border-collapse:collapse;width:100%;margin:8px 0;font:12px/1.4 Menlo,monospace}td,th{border:1px solid #cfc8bd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#ebe5db}.kv th{width:200px}code{word-break:break-all}.note{border-left:3px solid #c9632f;padding:6px 10px;background:#fbf6ef}@media print{body{background:#fff;padding:0}}</style></head><body>
<p style="font:11px Menlo,monospace;letter-spacing:.12em;color:#c9632f">Ecoscope &middot; See the Planet. Detect the Trends. Understand the Change.</p>
<h1>Research report</h1>
<p>Generated by server at ${esc(r.generated_at)} &middot; report assembled ${esc(new Date().toISOString())}</p>
<p class="note">All values below were returned by the Ecoscope API and are reproduced without modification. Explanations are ${esc(r.explanation_mode)} (deterministic, rule-based), not generative AI. To save as PDF, use your browser's Print dialog; this file is HTML.</p>
<h2>Request</h2><pre style="white-space:pre-wrap;font:12px Menlo,monospace">${esc(JSON.stringify(input, null, 2))}</pre>
${r.answer ? `<h2>Evidence answer (${esc(r.explanation_mode)})</h2><p>${esc(r.answer)}</p>` : ""}
${dsSection("Primary dataset", r.dataset, r.analysis)}
${r.comparison_dataset && r.comparison_analysis ? dsSection("Comparison dataset", r.comparison_dataset, r.comparison_analysis) : ""}
${c ? `<section><h2>Matched comparison (${esc(c.status)})</h2><p>${esc(c.method)}</p>
<p>Matched periods ${esc(c.matched_count)} &middot; mean difference ${esc(f(c.mean_difference))} ${esc(c.unit)} &middot; Pearson ${esc(f(c.pearson))} &middot; Spearman ${esc(f(c.spearman))}</p>
${c.warnings.length ? `<ul>${c.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
<table><thead><tr><th>Period</th><th>Primary</th><th>Comparison</th><th>Difference</th></tr></thead><tbody>${c.values.map((v) => `<tr><td>${esc(v.period)}</td><td>${esc(v.left)}</td><td>${esc(v.right)}</td><td>${esc(v.difference)}</td></tr>`).join("")}</tbody></table></section>` : ""}
<h2>Primary values</h2><table><thead><tr><th>Period</th><th>Value (${esc(r.dataset.unit)})</th><th>Uncertainty</th></tr></thead><tbody>${r.dataset.values.map((v) => `<tr><td>${esc(v.period)}</td><td>${esc(v.value === null ? "gap" : v.value)}</td><td>${esc(v.uncertainty ?? "")}</td></tr>`).join("")}</tbody></table>
</body></html>`;
}

export function printHtml(html: string) {
  const w = window.open("", "_blank", "noopener=no");
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 300);
  return true;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
