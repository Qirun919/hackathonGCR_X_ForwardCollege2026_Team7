"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Report, TestCase } from "@/lib/schema";
import { DEMO_SCENARIOS } from "@/lib/demo";
import { reportToMarkdown, downloadMarkdown } from "@/lib/markdown";

type ApiMeta = { model: string; mock: boolean; truncated?: boolean; retried?: boolean };

const MAX_FILE_BYTES = 200 * 1024;
const TOP_TESTS = 3;

const INK = "#1a1a1a";
const MUTED = "#555";

const card: CSSProperties = {
  background: "#ffffff",
  color: INK,
  border: "1px solid #e2e2e2",
  borderRadius: 12,
  padding: 20,
  marginTop: 16,
};

const badgeBase: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 700,
  padding: "2px 10px",
  borderRadius: 999,
  border: "1px solid",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  whiteSpace: "nowrap",
};

function severityStyle(s: string): CSSProperties {
  if (s === "breaking") return { ...badgeBase, color: "#721c24", background: "#f8d7da", borderColor: "#e5a3ab" };
  if (s === "major") return { ...badgeBase, color: "#7a5b00", background: "#fff3cd", borderColor: "#e6c200" };
  return { ...badgeBase, color: "#0c5460", background: "#d1ecf1", borderColor: "#9adbe8" };
}

function findingTypeStyle(t: string): CSSProperties {
  if (t === "documented") return { ...badgeBase, color: "#155724", background: "#d4edda", borderColor: "#a3d9b1" };
  if (t === "inferred") return { ...badgeBase, color: "#7a5b00", background: "#fff3cd", borderColor: "#e6c200" };
  return { ...badgeBase, color: "#383d41", background: "#e2e3e5", borderColor: "#c4c6c8" };
}

function confidenceStyle(c: string): CSSProperties {
  if (c === "high") return { ...badgeBase, color: "#155724", background: "#d4edda", borderColor: "#a3d9b1" };
  if (c === "medium") return { ...badgeBase, color: "#7a5b00", background: "#fff3cd", borderColor: "#e6c200" };
  return { ...badgeBase, color: "#721c24", background: "#f8d7da", borderColor: "#e5a3ab" };
}

function priorityStyle(p: string): CSSProperties {
  if (p === "P0") return { ...badgeBase, color: "#721c24", background: "#f8d7da", borderColor: "#e5a3ab" };
  if (p === "P1") return { ...badgeBase, color: "#7a5b00", background: "#fff3cd", borderColor: "#e6c200" };
  return { ...badgeBase, color: "#0c5460", background: "#d1ecf1", borderColor: "#9adbe8" };
}

function severityAccent(severity: string): string {
  if (severity === "breaking") return "#dc3545";
  if (severity === "major") return "#e6a200";
  return "#17a2b8";
}

const itemCard = (accent: string): CSSProperties => ({
  background: "#fafafa",
  color: INK,
  border: "1px solid #e6e6e6",
  borderLeft: `5px solid ${accent}`,
  borderRadius: 8,
  padding: "12px 14px",
  marginBottom: 10,
});

const primaryBtn: CSSProperties = {
  background: "#111111",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "#ffffff",
  color: INK,
  border: "1px solid #cccccc",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
};

const stopBtn: CSSProperties = {
  background: "#ffffff",
  color: "#721c24",
  border: "1px solid #e5a3ab",
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 700,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: INK,
  fontSize: 14,
};

const detailsStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  color: INK,
};

const statBox: CSSProperties = {
  flex: "1 1 140px",
  background: "#f8f9fa",
  border: "1px solid #e6e6e6",
  borderRadius: 10,
  padding: "12px 14px",
  textAlign: "center",
};

function shortChange(change: string, max = 220): string {
  const oneLine = change.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

function orderTests(tests: TestCase[]): TestCase[] {
  const order = { P0: 0, P1: 1, P2: 2 };
  return [...tests].sort((a, b) => order[a.priority] - order[b.priority]);
}

function TestCard({ t }: { t: TestCase }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={itemCard(severityAccent(t.priority === "P0" ? "breaking" : t.priority === "P1" ? "major" : "minor"))}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={priorityStyle(t.priority)}>{t.priority}</span>
        <strong style={{ color: INK, fontSize: 15 }}>
          {t.id} — {t.title}
        </strong>
      </div>
      <p style={{ color: INK, margin: "8px 0 4px" }}>
        Tests <strong>{t.covers}</strong>
        {t.summary || t.expected ? ` — ${t.summary || t.expected}` : ""}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...secondaryBtn, padding: "4px 10px", fontSize: 13 }}
        aria-expanded={open}
      >
        {open ? "Hide details" : "View details"}
      </button>
      {open && (
        <div style={detailsStyle}>
          {t.preconditions && (
            <p style={{ margin: "8px 0 4px" }}>
              <strong>Preconditions:</strong> {t.preconditions}
            </p>
          )}
          <strong>Steps:</strong>
          <ol style={{ paddingLeft: 20, margin: "4px 0" }}>
            {t.steps.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ol>
          <p style={{ margin: "4px 0" }}>
            <strong>Expected:</strong> {t.expected}
          </p>
          <p style={{ margin: "4px 0 0", color: MUTED }}>
            <strong>Covers risk/requirement:</strong> {t.rationale}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [docs, setDocs] = useState(() => DEMO_SCENARIOS[0].docs);
  const [change, setChange] = useState(() => DEMO_SCENARIOS[0].change);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAllTests, setShowAllTests] = useState(false);
  const [demoId, setDemoId] = useState<string>(DEMO_SCENARIOS[0].id);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  function stopAnalyze() {
    stoppedRef.current = true;
    setStopped(true);
    abortRef.current?.abort();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (${Math.round(file.size / 1024)}KB). Limit is 200KB.`);
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        setError("File is empty — nothing was added.");
        return;
      }
      setDocs((prev) => (prev ? prev + "\n\n" + text : text).slice(0, 60000));
      setError(null);
    } catch {
      setError("Could not read that file. Try a plain .md or .txt file.");
    }
  }

  async function analyze() {
    // Client-side guardrails mirror the server so users get instant feedback.
    if (docs.trim().length < 20) {
      setError("API documentation is too short — paste at least a few lines describing your endpoints.");
      return;
    }
    if (change.trim().length < 10) {
      setError("Change description is too short — describe what is changing.");
      return;
    }
    const hasEndpoint = /^#{0,3}\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/\S+/gim.test(docs);
    const pathCount = docs.match(/\/[a-zA-Z0-9_{}-]+(?:\/[a-zA-Z0-9_{}.-]+)+/g)?.length ?? 0;
    if (!hasEndpoint && pathCount < 2) {
      setError("This doesn't look like API documentation — no endpoints or paths detected. Paste docs with lines like 'GET /tasks'.");
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    setShowAllTests(false);
    setStopped(false);
    stoppedRef.current = false;
    // Clear the previous result immediately so a new request never
    // shows stale findings while analyzing.
    setReport(null);
    setMeta(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiDocs: docs, changeRequest: change }),
        signal: controller.signal,
      });
      let data: { error?: string; mockReport?: Report; report?: Report; meta?: ApiMeta };
      try {
        data = await res.json();
      } catch {
        setError("Server returned an unreadable response. Please retry.");
        setReport(null);
        setMeta(null);
        return;
      }
      if (!res.ok) {
        // Keep the mock fallback available for demo continuity.
        if (data.mockReport) {
          setError(`${data.error} — you can load the cached demo result below.`);
          (window as unknown as { __mock?: unknown }).__mock = data.mockReport;
        } else {
          setError(data.error ?? "Analysis failed.");
        }
        setReport(null);
        setMeta(null);
        return;
      }
      if (!data.report) {
        setError("Server returned an empty result. Please retry.");
        setReport(null);
        setMeta(null);
        return;
      }
      setReport(data.report);
      setMeta(data.meta ?? { model: "unknown", mock: false });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (stoppedRef.current) {
          setError(null);
        } else {
          setError("Request timed out after 2 minutes. The AI may be slow — please retry.");
        }
      } else {
        setError("Network error. Check the dev server and try again.");
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setLoading(false);
    }
  }

  function loadCached() {
    const mock = (window as unknown as { __mock?: Report }).__mock;
    if (mock) {
      setReport(mock);
      setMeta({ model: "mock (cached demo)", mock: true });
      setError(null);
      setShowAllTests(false);
    }
  }

  function loadDemo(id: string) {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];
    setDocs(scenario.docs);
    setChange(scenario.change);
    setDemoId(scenario.id);
    setError(null);
  }

  function loadRandomDemo() {
    // Never pick the currently loaded scenario, so every click visibly changes the form.
    const others = DEMO_SCENARIOS.filter((s) => s.id !== demoId);
    const pool = others.length > 0 ? others : DEMO_SCENARIOS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    loadDemo(pick.id);
  }

  const demoLabel = DEMO_SCENARIOS.find((s) => s.id === demoId)?.label ?? "";

  const valid = docs.trim().length > 0 && change.trim().length > 0;

  const analysis = useMemo(() => {
    if (!report) return null;
    const breaking = report.risks.filter((r) => r.severity === "breaking").length;
    const ordered = orderTests(report.testCases);
    const headline =
      report.impactSummary || report.risks[0]?.summary || report.risks[0]?.detail || "";
    return { breaking, ordered, headline };
  }, [report]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, fontFamily: "Arial, sans-serif", background: "#f4f5f7", color: INK, minHeight: "100vh" }}>
      <h1 style={{ color: INK }}>AI Change Impact Analyzer</h1>
      <p style={{ color: MUTED }}>
        Paste API docs, describe the change, get an evidence-linked impact report + regression plan.
        {" "}Have raw code instead? <Link href="/generate" style={{ color: INK, fontWeight: 700 }}>Generate docs from source →</Link>
      </p>

      <section style={card}>
        <h2 style={{ color: INK, fontSize: 18, marginBottom: 12 }}>1. Input</h2>
        <label style={{ color: INK }}>
          <strong>API documentation</strong> <span style={{ color: MUTED }}>({docs.length} chars)</span>
        </label>
        <textarea
          value={docs}
          onChange={(e) => setDocs(e.target.value)}
          rows={10}
          style={inputStyle}
          placeholder="Paste API documentation here..."
          disabled={loading}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".md,.txt" onChange={(e) => handleFile(e.target.files?.[0])} disabled={loading} />
          <button
            type="button"
            onClick={loadRandomDemo}
            disabled={loading}
            style={{ ...secondaryBtn, opacity: loading ? 0.5 : 1 }}
          >
            Load random demo data
          </button>
          <span style={{ color: MUTED, fontSize: 13 }}>Current: {demoLabel}</span>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ color: INK }}>
            <strong>Proposed change</strong> <span style={{ color: MUTED }}>({change.length} chars)</span>
          </label>
          <textarea
            value={change}
            onChange={(e) => setChange(e.target.value)}
            rows={4}
            style={inputStyle}
            placeholder="Describe the API or feature change..."
            disabled={loading}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={analyze}
            disabled={loading || !valid}
            style={{ ...primaryBtn, opacity: loading || !valid ? 0.5 : 1 }}
          >
            {loading ? "Analyzing…" : "Analyze impact"}
          </button>
          {loading && (
            <button type="button" onClick={stopAnalyze} style={stopBtn}>
              Stop
            </button>
          )}
        </div>
        {!valid && <p style={{ color: MUTED }}>Enter API docs and a change description to enable analysis.</p>}
        {loading && <p style={{ color: INK }}>Contacting AI… this usually takes 10–30s.</p>}
        {stopped && !loading && (
          <p style={{ color: MUTED }}>Analysis stopped. Adjust the inputs or run it again when ready.</p>
        )}
      </section>

      {error && (
        <div style={{ ...card, borderColor: "#e5a3ab", background: "#fdf0f1" }}>
          <p style={{ color: "#721c24", fontWeight: 700 }}>{error}</p>
          <button type="button" onClick={loadCached} style={{ ...secondaryBtn, marginTop: 8 }}>
            Load cached demo result
          </button>
        </div>
      )}

      {report && meta && analysis && (
        <article style={{ marginTop: 8 }}>
          {/* A. Impact summary */}
          <section style={card} aria-label="Impact summary">
            <h2 style={{ color: INK }}>
              Impact Report {meta.mock && <span style={{ color: "#7a5b00" }}>(demo fallback)</span>}
            </h2>
            <p style={{ color: MUTED, margin: "4px 0 12px" }}>
              Change analysed: <q style={{ color: INK }}>{shortChange(change || "—")}</q>
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={statBox}>
                <div style={{ fontSize: 26, fontWeight: 800, color: INK }}>{report.affectedEndpoints.length}</div>
                <div style={{ color: MUTED, fontSize: 13 }}>affected endpoints</div>
              </div>
              <div style={statBox}>
                <div style={{ fontSize: 26, fontWeight: 800, color: analysis.breaking > 0 ? "#721c24" : INK }}>
                  {report.risks.length}
                </div>
                <div style={{ color: MUTED, fontSize: 13 }}>
                  findings ({analysis.breaking} breaking)
                </div>
              </div>
              <div style={statBox}>
                <div style={{ fontSize: 26, fontWeight: 800, color: INK }}>{report.openQuestions.length}</div>
                <div style={{ color: MUTED, fontSize: 13 }}>open questions</div>
              </div>
              <div style={statBox}>
                <div style={{ fontSize: 26, fontWeight: 800, color: INK }}>{report.testCases.length}</div>
                <div style={{ color: MUTED, fontSize: 13 }}>suggested tests</div>
              </div>
            </div>
            {analysis.headline && (
              <p style={{ color: INK, margin: "12px 0 0", fontSize: 15 }}>
                <strong>Bottom line:</strong> {analysis.headline}
              </p>
            )}
            {meta.truncated && (
              <p style={{ color: "#7a5b00" }}>Note: long input was truncated; endpoint lines were preserved.</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={() => downloadMarkdown(reportToMarkdown(report, change))} style={primaryBtn}>
                Download Markdown
              </button>
              <button
                type="button"
                style={secondaryBtn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reportToMarkdown(report, change));
                    setCopied(true);
                  } catch {
                    downloadMarkdown(reportToMarkdown(report, change));
                  }
                }}
              >
                {copied ? "Copied!" : "Copy Markdown"}
              </button>
            </div>
          </section>

          {/* B. Main findings */}
          <section style={card} aria-label="Main findings">
            <h3 style={{ color: INK, marginBottom: 4 }}>
              Main Findings <span style={{ color: MUTED }}>({report.risks.length})</span>
            </h3>
            <p style={{ color: MUTED, margin: "0 0 12px", fontSize: 13 }}>
              Grouped by root cause — one card per distinct issue. Severity: breaking = clients will fail;
              major = needs attention; minor = edge case.
            </p>
            {report.risks.map((r, i) => (
              <div key={i} style={itemCard(severityAccent(r.severity))}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ color: INK, fontSize: 15 }}>{r.title}</strong>
                  <span style={severityStyle(r.severity)}>{r.severity}</span>
                  <span style={findingTypeStyle(r.type)}>
                    {r.type === "documented" ? "documented" : r.type === "inferred" ? "inferred risk" : "unresolved"}
                  </span>
                </div>
                <p style={{ color: INK, margin: "8px 0" }}>{r.summary || r.detail}</p>
                {r.affectedEndpoints.length > 0 && (
                  <p style={{ color: MUTED, margin: "0 0 4px", fontSize: 14 }}>
                    Affects: {r.affectedEndpoints.join(" · ")}
                  </p>
                )}
                {r.evidence && (
                  <p style={{ color: MUTED, margin: 0, fontSize: 14 }}>
                    Evidence: <q style={{ color: INK }}>{r.evidence}</q>
                  </p>
                )}
                {!r.evidence && r.type !== "documented" && (
                  <p style={{ color: MUTED, margin: 0, fontSize: 14 }}>
                    No direct doc quote — treat as unverified assumption.
                  </p>
                )}
              </div>
            ))}
          </section>

          {/* C. Affected endpoints */}
          <section style={card} aria-label="Affected endpoints">
            <h3 style={{ color: INK, marginBottom: 12 }}>
              Affected Endpoints <span style={{ color: MUTED }}>({report.affectedEndpoints.length})</span>
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, color: INK }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                    <th style={{ padding: "6px 8px" }}>Endpoint</th>
                    <th style={{ padding: "6px 8px" }}>Why</th>
                    <th style={{ padding: "6px 8px" }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.affectedEndpoints.map((ep, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <strong>
                          {ep.method} {ep.path}
                        </strong>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {ep.reason}
                        <details style={detailsStyle}>
                          <summary style={{ cursor: "pointer", color: MUTED }}>Evidence</summary>
                          <q>{ep.evidence}</q>
                        </details>
                      </td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <span style={confidenceStyle(ep.confidence)}>{ep.confidence}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* D. Open questions */}
          <section style={card} aria-label="Open questions">
            <h3 style={{ color: INK, marginBottom: 4 }}>
              Open Questions <span style={{ color: MUTED }}>({report.openQuestions.length})</span>
            </h3>
            <p style={{ color: MUTED, margin: "0 0 12px", fontSize: 13 }}>
              Unresolved items that could change the implementation or test plan. The AI could not
              determine these from the docs — no rules were invented.
            </p>
            <ol style={{ color: INK, paddingLeft: 20, margin: 0 }}>
              {report.openQuestions.map((q, i) => (
                <li key={i} style={{ marginBottom: 6, color: INK }}>
                  {q}
                </li>
              ))}
            </ol>
          </section>

          {/* E. Regression tests: top 3 + expander */}
          <section style={card} aria-label="Regression test plan">
            <h3 style={{ color: INK, marginBottom: 4 }}>
              Regression Tests <span style={{ color: MUTED }}>(suggested, not executed — {report.testCases.length})</span>
            </h3>
            <p style={{ color: MUTED, margin: "0 0 12px", fontSize: 13 }}>
              P0 = breaking/auth/data-loss (run first) · P1 = likely affected · P2 = edge case.
            </p>
            {(showAllTests ? analysis.ordered : analysis.ordered.slice(0, TOP_TESTS)).map((t) => (
              <TestCard key={t.id} t={t} />
            ))}
            {analysis.ordered.length > TOP_TESTS && (
              <button type="button" onClick={() => setShowAllTests((v) => !v)} style={secondaryBtn}>
                {showAllTests
                  ? "Show fewer tests"
                  : `View all tests (${analysis.ordered.length - TOP_TESTS} more)`}
              </button>
            )}
          </section>
        </article>
      )}
    </main>
  );
}
