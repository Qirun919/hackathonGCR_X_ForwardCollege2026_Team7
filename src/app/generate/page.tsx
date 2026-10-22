"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  CODE_ROLES,
  DEMO_PROJECTS,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_TOTAL_CHARS,
  demoProject,
  newFileId,
  type CodeFile,
  type CodeRole,
} from "@/lib/code-docs";

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

const monoStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};

type Completeness = {
  detectedComponents: { file: string; kind: string }[];
  totalEndpoints: number;
  complete: string[];
  partial: { endpoint: string; missing: string[] }[];
  componentOnly: string[];
  missing: string[];
  recommendedFiles: string[];
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusBadge(status: string): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 10px",
    borderRadius: 999,
    border: "1px solid",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
  if (status === "complete") return { ...base, color: "#155724", background: "#d4edda", borderColor: "#a3d9b1" };
  if (status === "partial") return { ...base, color: "#7a5b00", background: "#fff3cd", borderColor: "#e6c200" };
  return { ...base, color: "#383d41", background: "#e2e3e5", borderColor: "#c4c6c8" };
}

export default function GeneratePage() {
  const [projectName, setProjectName] = useState("account-api");
  const [projectDesc, setProjectDesc] = useState("");
  const [files, setFiles] = useState<CodeFile[]>(() => demoProject("account-complete").files.map((x) => ({ ...x })));
  const [activeId, setActiveId] = useState<string>(() => demoProject("account-complete").files[0]?.id ?? "");
  const [demoId, setDemoId] = useState("account-complete");
  const [markdown, setMarkdown] = useState("");
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const active = files.find((f) => f.id === activeId) ?? files[0];
  const totalChars = useMemo(() => files.reduce((n, f) => n + f.content.length, 0), [files]);
  const valid = files.length > 0 && files.every((f) => f.content.trim().length > 0);

  function updateActive(patch: Partial<CodeFile>) {
    if (!active) return;
    setFiles((prev) => prev.map((f) => (f.id === active.id ? { ...f, ...patch } : f)));
  }

  const MAX_UPLOAD_BYTES = 200 * 1024;
  const BAD_EXT_CLIENT = /\.(exe|dll|so|bin|zip|tar|gz|rar|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|mp4|mov)$/i;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setError(`Max ${MAX_FILES} files per request.`);
      return;
    }
    const existing = new Set(files.map((f) => f.name.toLowerCase()));
    const picked = [...list].slice(0, remaining);
    const rejectedExt = picked.filter((f) => BAD_EXT_CLIENT.test(f.name)).map((f) => f.name);
    if (rejectedExt.length > 0) {
      setError(`Unsupported file types (source files only): ${rejectedExt.join(", ")}.`);
      return;
    }
    const rejectedDup = picked.filter((f) => existing.has(f.name.toLowerCase())).map((f) => f.name);
    if (rejectedDup.length > 0) {
      setError(`Already added (duplicate filenames): ${rejectedDup.join(", ")}.`);
      return;
    }
    const oversized = picked.filter((f) => f.size > MAX_UPLOAD_BYTES).map((f) => f.name);
    if (oversized.length > 0) {
      setError(`Too large (max 200KB each): ${oversized.join(", ")}.`);
      return;
    }
    Promise.all(
      picked.map(async (file) => {
        const text = await file.text().catch(() => "");
        const lower = file.name.toLowerCase();
        let role: CodeRole = "other";
        if (/route|router/.test(lower)) role = "route";
        else if (/controller/.test(lower)) role = "controller";
        else if (/service/.test(lower)) role = "service";
        else if (/model|schema/.test(lower)) role = "model";
        else if (/middle|auth|guard/.test(lower)) role = "middleware";
        return { id: newFileId(), name: file.name, role, content: text.slice(0, MAX_FILE_CHARS) };
      })
    ).then((arr) => {
      const ok = arr.filter((f) => f.content.trim().length > 0);
      if (ok.length === 0) setError("Uploaded files were empty or unreadable (.js/.ts recommended).");
      else {
        setFiles((prev) => [...prev, ...ok]);
        setActiveId(ok[0].id);
        setError(null);
      }
    });
  }

  function addFile() {
    if (files.length >= MAX_FILES) {
      setError(`Max ${MAX_FILES} files per request.`);
      return;
    }
    const f: CodeFile = { id: newFileId(), name: `server${files.length + 1}.js`, role: "other", content: "" };
    setFiles((prev) => [...prev, f]);
    setActiveId(f.id);
  }

  function startEmpty() {
    const f: CodeFile = { id: newFileId(), name: "server1.js", role: "other", content: "" };
    setFiles([f]);
    setActiveId(f.id);
    setMarkdown("");
    setCompleteness(null);
    setWarnings([]);
    setError(null);
  }

  function loadDemo(id: string) {
    const d = demoProject(id);
    setFiles(d.files.map((x) => ({ ...x })));
    setActiveId(d.files[0]?.id ?? "");
    setProjectName(d.projectName);
    setDemoId(d.id);
    // Keep previous markdown so iterative runs can be compared; new run clears it.
    setError(null);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (activeId === id && next.length > 0) setActiveId(next[0].id);
      return next;
    });
  }

  function stopGenerate() {
    stoppedRef.current = true;
    setStopped(true);
    abortRef.current?.abort();
  }

  async function generate() {
    if (files.length === 0) {
      setError("Add at least one source file first.");
      return;
    }
    // Client-side guardrails mirror the server for instant feedback.
    const names = files.map((f) => f.name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setError(`Duplicate filenames: ${[...new Set(dupes)].join(", ")}. Rename or remove duplicates.`);
      return;
    }
    const INJECTION_CLIENT = /(ignore (all )?previous instructions|you are now|disregard (all )?(prior|previous)|jailbreak|reveal .*(key|prompt|secret))/i;
    const injected = files.filter((f) => INJECTION_CLIENT.test(f.content) || INJECTION_CLIENT.test(f.name)).map((f) => f.name);
    if (injected.length > 0) {
      setError(`Blocked instruction-override text in: ${injected.join(", ")}. Remove it before generating.`);
      return;
    }
    const CODE_SIGNS_CLIENT = /(require\s*\(|import\s+.*from|module\.exports|export\s+(default|const|function|class)|function\s+\w+\s*\(|=>|mongoose\.|express\s*\(|router\.(get|post|put|patch|delete)|console\.log)/;
    const nonCode = files.filter((f) => f.content.trim().length >= 60 && !CODE_SIGNS_CLIENT.test(f.content.slice(0, 3000))).map((f) => f.name);
    if (nonCode.length > 0) {
      setError(`These don't look like source code: ${nonCode.join(", ")}. Paste .js/.ts backend files.`);
      return;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      setError(`Source code too large (${totalChars} chars, max ${MAX_TOTAL_CHARS}). Remove files or trim.`);
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    setStopped(false);
    stoppedRef.current = false;
    // Clear previous output immediately so a re-run never shows stale docs.
    // Files are preserved — iterative runs keep context and just re-analyze.
    setMarkdown("");
    setCompleteness(null);
    setWarnings([]);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const res = await fetch("/api/documentation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectDesc ? `${projectName} — ${projectDesc}` : projectName,
          files: files.map((f) => ({ name: f.name, role: f.role, content: f.content.slice(0, MAX_FILE_CHARS) })),
        }),
        signal: controller.signal,
      });
      let data: { markdown?: string; warnings?: string[]; completeness?: Completeness; error?: string };
      try {
        data = await res.json();
      } catch {
        setError("Server returned an unreadable response. Please retry.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Generation failed.");
        return;
      }
      if (!data.markdown) {
        setError("Server returned an empty result. Please retry.");
        return;
      }
      setMarkdown(data.markdown);
      setCompleteness(data.completeness ?? null);
      setWarnings(data.warnings ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (!stoppedRef.current) setError("Request timed out after 3 minutes. The AI may be slow — please retry.");
      } else {
        setError("Network error. Check the dev server and try again.");
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "Arial, sans-serif", background: "#f4f5f7", color: INK, minHeight: "100vh" }}>
      <p style={{ color: MUTED, fontSize: 14 }}>
        <Link href="/" style={{ color: INK }}>← Back to Impact Analyzer</Link>
      </p>
      <h1 style={{ color: INK }}>Code → Markdown API Docs</h1>
      <p style={{ color: MUTED }}>
        Paste Express backend files, check completeness, generate structured Markdown, then submit it to the Impact Analyzer workflow.
      </p>

      {/* A. Source input */}
      <section style={card} aria-label="Source code input">
        <h2 style={{ color: INK, fontSize: 18 }}>A. Source files ({files.length}/{MAX_FILES}, {totalChars} chars)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ color: INK, flex: "1 1 160px" }}>
            <strong>Project name</strong>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} style={inputStyle} disabled={loading} />
          </label>
          <label style={{ color: INK, flex: "2 1 240px" }}>
            <strong>Project description (optional)</strong>
            <input value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} style={inputStyle} disabled={loading} placeholder="e.g. account tier management API" />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ ...secondaryBtn, display: "inline-block", cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1 }}>
            Upload .js / .ts files
            <input type="file" accept=".js,.ts,.mjs,.cjs,.json" multiple style={{ display: "none" }} disabled={loading} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <span style={{ color: MUTED, fontSize: 13, marginLeft: 8 }}>or paste below · role auto-detected from filename</span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveId(f.id)}
              disabled={loading}
              style={{
                ...secondaryBtn,
                padding: "4px 10px",
                fontSize: 13,
                background: f.id === active?.id ? INK : "#ffffff",
                color: f.id === active?.id ? "#ffffff" : INK,
              }}
            >
              {f.name} · {f.role}
            </button>
          ))}
          <button type="button" onClick={addFile} disabled={loading} style={{ ...secondaryBtn, padding: "4px 10px", fontSize: 13 }}>
            + Add file
          </button>
          <button type="button" onClick={startEmpty} disabled={loading} style={{ ...secondaryBtn, padding: "4px 10px", fontSize: 13 }}>
            Start empty
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ color: INK, fontSize: 14 }}>
            <strong>Demo project</strong>{" "}
            <select value={demoId} onChange={(e) => loadDemo(e.target.value)} disabled={loading} style={{ ...inputStyle, width: "auto", display: "inline-block" }}>
              {DEMO_PROJECTS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
          <p style={{ color: MUTED, fontSize: 13 }}>{demoProject(demoId).description}</p>
        </div>

        {active ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ color: INK, flex: "2 1 200px" }}>
                <strong>File name</strong>
                <input value={active.name} onChange={(e) => updateActive({ name: e.target.value })} style={inputStyle} disabled={loading} />
              </label>
              <label style={{ color: INK, flex: "1 1 140px" }}>
                <strong>Role</strong>
                <select value={active.role} onChange={(e) => updateActive({ role: e.target.value as CodeRole })} style={inputStyle} disabled={loading}>
                  {CODE_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => removeFile(active.id)}
                disabled={loading || files.length <= 1}
                style={{ ...secondaryBtn, alignSelf: "flex-end", opacity: loading || files.length <= 1 ? 0.5 : 1 }}
              >
                Remove
              </button>
            </div>
            <textarea
              value={active.content}
              onChange={(e) => updateActive({ content: e.target.value.slice(0, MAX_FILE_CHARS) })}
              rows={14}
              style={monoStyle}
              placeholder="Paste source code…"
              disabled={loading}
            />
            <p style={{ color: MUTED, fontSize: 12 }}>{active.content.length}/{MAX_FILE_CHARS} chars</p>
          </div>
        ) : (
          <p style={{ color: MUTED }}>No files — add one to begin.</p>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="button" onClick={generate} disabled={loading || !valid} style={{ ...primaryBtn, opacity: loading || !valid ? 0.5 : 1 }}>
            {loading ? "Analyzing…" : completeness ? "Re-analyze with all files" : "Analyze & Generate Documentation"}
          </button>
          {loading && (
            <button type="button" onClick={stopGenerate} style={stopBtn}>
              Stop
            </button>
          )}
        </div>
        {!valid && <p style={{ color: MUTED }}>Add at least one file with source code to enable generation.</p>}
        {loading && <p style={{ color: INK }}>Classifying files, evaluating completeness, generating docs…</p>}
        {stopped && !loading && <p style={{ color: MUTED }}>Generation stopped.</p>}
      </section>

      {/* B. Completeness report */}
      {(completeness || loading) && (
        <section style={card} aria-label="Analysis and completeness">
          <h2 style={{ color: INK, fontSize: 18 }}>B. Completeness report</h2>
          {loading && !completeness && <p style={{ color: INK }}>Waiting for analysis…</p>}
          {completeness && (
            <>
              <p style={{ color: INK }}>
                <strong>{completeness.totalEndpoints}</strong> endpoint(s) found ·{" "}
                <strong>{completeness.complete.length}</strong> complete ·{" "}
                <strong>{completeness.partial.length}</strong> partial ·{" "}
                <strong>{completeness.componentOnly.length}</strong> component-only
              </p>
              <h3 style={{ color: INK, fontSize: 15 }}>Detected components</h3>
              <ul style={{ color: INK, paddingLeft: 20 }}>
                {completeness.detectedComponents.map((c, i) => (
                  <li key={i}><code>{c.file}</code> → {c.kind}</li>
                ))}
              </ul>
              {completeness.partial.length > 0 && (
                <>
                  <h3 style={{ color: INK, fontSize: 15 }}>Partially documented</h3>
                  <ul style={{ color: INK, paddingLeft: 20 }}>
                    {completeness.partial.map((p, i) => (
                      <li key={i}>
                        <strong>{p.endpoint}</strong> <span style={statusBadge("partial")}>partial</span>
                        <br />
                        <span style={{ color: MUTED }}>Missing: {p.missing.join("; ") || "details"}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {completeness.componentOnly.length > 0 && (
                <>
                  <h3 style={{ color: INK, fontSize: 15 }}>Component only (no endpoint)</h3>
                  <ul style={{ color: INK, paddingLeft: 20 }}>
                    {completeness.componentOnly.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {completeness.recommendedFiles.length > 0 && (
                <>
                  <h3 style={{ color: INK, fontSize: 15 }}>Recommended next files</h3>
                  <ul style={{ color: INK, paddingLeft: 20 }}>
                    {completeness.recommendedFiles.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <p style={{ color: MUTED, fontSize: 13 }}>
                    Add the files above (upload or paste in section A — your current files are kept), then click “Re-analyze with all files”.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* C. Markdown output */}
      <section style={card} aria-label="Markdown preview">
        <h2 style={{ color: INK, fontSize: 18 }}>C. Generated Markdown</h2>
        {error && (
          <div style={{ border: "1px solid #e5a3ab", background: "#fdf0f1", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ color: "#721c24", fontWeight: 700, margin: 0 }}>{error}</p>
          </div>
        )}
        {warnings.length > 0 && (
          <ul style={{ color: "#7a5b00", fontSize: 14, paddingLeft: 20 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {!markdown && !loading && !error && (
          <p style={{ color: MUTED }}>Output will appear here. Add files above, then generate. You can edit before copying to the Workflow Generator.</p>
        )}
        {markdown && (
          <>
            <div style={{ marginBottom: 8 }}>
              <button type="button" onClick={() => setEditMode((v) => !v)} style={secondaryBtn}>
                {editMode ? "Show preview" : "Edit Markdown"}
              </button>
            </div>
            {editMode ? (
              <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={26} style={monoStyle} aria-label="Generated Markdown (editable)" />
            ) : (
              <pre style={{ ...monoStyle, whiteSpace: "pre-wrap", background: "#fafafa" }}>{markdown}</pre>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                style={secondaryBtn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(markdown);
                    setCopied(true);
                  } catch {
                    downloadText("api-docs.md", markdown);
                  }
                }}
              >
                {copied ? "Copied!" : "Copy Markdown"}
              </button>
              <button type="button" onClick={() => downloadText("api-docs.md", markdown)} style={primaryBtn}>
                Download .md
              </button>
              <button type="button" onClick={generate} disabled={loading} style={{ ...secondaryBtn, opacity: loading ? 0.5 : 1 }}>
                Regenerate
              </button>
            </div>
            <p style={{ color: MUTED, fontSize: 13 }}>
              Next: paste this Markdown into the <Link href="/" style={{ color: INK }}>Impact Analyzer</Link> as API documentation.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
