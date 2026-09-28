import { Fragment, useMemo, useRef, useState } from "react";
import { BRANCH_COLORS, FAMILY_COLORS, type ClassificationResult, type DisplayFamily, type WordOccurrence } from "@jev-etymology/shared";
import { buildCsvReport, chunkTargets, classifyBatch, countFamilies, MAX_WORDS, prepareAnalysis } from "./analysis";

const SAMPLE = "The cow wandered through the bazaar while a robot practiced yoga. ఇది మా ఇల్లు, విద్య చాలా ముఖ్యం. இது என் வீடு; தருமம் பற்றி அவர் பேசினார்.";
const WORKER_URL = import.meta.env.VITE_WORKER_URL || "http://localhost:8787";
const ORDER = ["PIE", "Semitic", "Dravidian", "Other-Unclear", "Uncertain", "Unclassified", "Pending"] as const;

type ResultMap = Record<string, ClassificationResult>;

function labelFor(result?: ClassificationResult) {
  if (!result) return "Pending";
  return result.branch ? `${result.family} · ${result.branch}` : result.family;
}

function tooltipFor(result?: ClassificationResult) {
  if (!result) return "Pending classification";
  const confidence = result.confidence == null ? "unavailable" : `${Math.round(result.confidence * 100)}%`;
  return `${labelFor(result)} · confidence ${confidence}${result.detail ? ` · ${result.detail}` : ""}`;
}

function AnnotatedText({ text, occurrences, results }: { text: string; occurrences: WordOccurrence[]; results: ResultMap }) {
  const nodes = [];
  let cursor = 0;
  for (const occurrence of occurrences) {
    if (occurrence.start > cursor) nodes.push(<Fragment key={`plain-${cursor}`}>{text.slice(cursor, occurrence.start)}</Fragment>);
    const result = results[occurrence.classificationId];
    const family = result?.family ?? "Pending";
    const lowConfidence = result?.confidence != null && result.confidence < 0.6;
    nodes.push(
      <span
        className={`word ${lowConfidence || family === "Uncertain" ? "word--uncertain" : ""}`}
        data-tooltip={tooltipFor(result)}
        key={occurrence.id}
        style={{ "--word-color": (result?.branch && BRANCH_COLORS[result.branch]) || FAMILY_COLORS[family] } as React.CSSProperties}
        tabIndex={0}
        aria-label={`${occurrence.word}: ${tooltipFor(result)}`}
      >
        {text.slice(occurrence.start, occurrence.end)}
      </span>
    );
    cursor = occurrence.end;
  }
  if (cursor < text.length) nodes.push(<Fragment key="plain-end">{text.slice(cursor)}</Fragment>);
  return <div className="annotated-text" aria-live="polite">{nodes}</div>;
}

function Chart({ occurrences, results }: { occurrences: WordOccurrence[]; results: ResultMap }) {
  const counts = useMemo(() => ({ ...Object.fromEntries(ORDER.map((key) => [key, 0])), ...countFamilies(occurrences, results) }) as Record<(typeof ORDER)[number], number>, [occurrences, results]);
  const total = Math.max(occurrences.length, 1);
  return (
    <section className="panel chart" aria-labelledby="chart-title">
      <div className="section-heading"><div><span className="eyebrow">Vocabulary mix</span><h2 id="chart-title">Language families</h2></div><span>{occurrences.length} words</span></div>
      <div className="stacked-bar" aria-hidden="true">
        {ORDER.filter((key) => counts[key]).map((key) => <span key={key} style={{ width: `${(counts[key] / total) * 100}%`, background: FAMILY_COLORS[key] }} />)}
      </div>
      <div className="chart-list">
        {ORDER.filter((key) => counts[key]).map((key) => (
          <div className="chart-row" key={key}>
            <span className="swatch" style={{ background: FAMILY_COLORS[key] }} /><span>{key}</span>
            <strong>{Math.round((counts[key] / total) * 100)}%</strong><small>{counts[key]}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [analyzedText, setAnalyzedText] = useState("");
  const [occurrences, setOccurrences] = useState<WordOccurrence[]>([]);
  const [results, setResults] = useState<ResultMap>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const preview = useMemo(() => prepareAnalysis(text), [text]);
  const completed = Object.keys(results).length;
  const uniqueCount = new Set(occurrences.map((item) => item.classificationId)).size;

  const cancel = () => {
    runId.current += 1;
    controller.current?.abort();
    setRunning(false);
  };

  const analyze = async () => {
    cancel();
    const currentRun = ++runId.current;
    const parsed = prepareAnalysis(text);
    setError("");
    setCopyStatus("idle");
    if (!parsed.occurrences.length) { setError("Enter at least one word to analyze."); return; }
    if (parsed.occurrences.length > MAX_WORDS) { setError(`Please keep the text to ${MAX_WORDS} words or fewer.`); return; }
    const abortController = new AbortController();
    controller.current = abortController;
    setAnalyzedText(text);
    setOccurrences(parsed.occurrences);
    setResults({});
    setRunning(true);
    try {
      for (const batch of chunkTargets(parsed.targets)) {
        await classifyBatch(WORKER_URL, text, batch, abortController.signal, (result) => {
          if (runId.current !== currentRun) return;
          setResults((previous) => ({ ...previous, [result.id]: result }));
        });
      }
    } catch (reason) {
      if (!abortController.signal.aborted && runId.current === currentRun) {
        setError(reason instanceof TypeError ? "Unable to reach the classification service." : reason instanceof Error ? reason.message : "Analysis failed.");
        setResults((previous) => {
          const next = { ...previous };
          for (const target of parsed.targets) {
            if (!next[target.id]) next[target.id] = { id: target.id, status: "error", family: "Unclassified", branch: null, confidence: null, familyConfidence: null, branchConfidence: null, detail: "Classification batch failed" };
          }
          return next;
        });
      }
    } finally {
      if (runId.current === currentRun) setRunning(false);
    }
  };

  const copyReport = async () => {
    const csv = buildCsvReport(analyzedText, occurrences, results);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = csv;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand("copy");
        fallback.remove();
        if (!copied) throw new Error("Copy command failed");
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <main>
      <header className="hero">
        <div className="mark" aria-hidden="true">wr</div>
        <p className="eyebrow">A Jev-powered language experiment</p>
        <h1>Every word carries<br /><em>a journey.</em></h1>
        <p className="intro">Paste a passage to see the language families beneath its surface—from inherited roots to words carried across cultures.</p>
      </header>

      <section className="workspace" aria-label="Etymology analyzer">
        <div className="editor panel">
          <div className="section-heading"><label htmlFor="source-text"><span className="eyebrow">Your passage</span><h2>Text to explore</h2></label><span className={preview.occurrences.length > MAX_WORDS ? "limit" : ""}>{preview.occurrences.length} / {MAX_WORDS}</span></div>
          <textarea id="source-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste a paragraph in English, తెలుగు, தமிழ், or a mix…" />
          <div className="actions">
            <p>Words repeat in the chart, while identical words in the same sentence are classified once.</p>
            {running ? <button className="secondary" onClick={cancel}>Cancel</button> : null}
            <button className="primary" onClick={analyze} disabled={running || preview.occurrences.length === 0 || preview.occurrences.length > MAX_WORDS}>Analyze roots <span>→</span></button>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </div>

        {occurrences.length ? (
          <div className="results-grid">
            <section className="panel reading" aria-labelledby="reading-title">
              <div className="section-heading">
                <div><span className="eyebrow">Word by word</span><h2 id="reading-title">Root map</h2></div>
                <div className="result-controls">
                  <span>{running ? `${completed} / ${uniqueCount}` : completed === uniqueCount ? "Complete" : "Cancelled"}</span>
                  <button className="report-button" onClick={copyReport} disabled={running || completed !== uniqueCount}>
                    {copyStatus === "copied" ? "Copied CSV ✓" : copyStatus === "error" ? "Copy failed" : "Copy CSV report"}
                  </button>
                </div>
              </div>
              {running ? <div className="progress"><span style={{ width: `${uniqueCount ? (completed / uniqueCount) * 100 : 0}%` }} /></div> : null}
              <AnnotatedText text={analyzedText} occurrences={occurrences} results={results} />
              <p className="hint">Hover, tap, or focus a word for its branch and confidence.</p>
            </section>
            <Chart occurrences={occurrences} results={results} />
          </div>
        ) : null}
      </section>

      <section className="legend" aria-labelledby="legend-title">
        <span className="eyebrow">Color key</span><h2 id="legend-title">Families at a glance</h2>
        <div className="legend-grid">
          {["PIE", "Semitic", "Dravidian", "Other-Unclear", "Uncertain", "Unclassified"].map((family) => <div key={family}><span className="swatch" style={{ background: FAMILY_COLORS[family as DisplayFamily] }} /><strong>{family}</strong></div>)}
        </div>
      </section>

      <footer><p>Results are probabilistic classifications, not dictionary citations. Use them to explore—and verify surprising roots with an etymological reference.</p><span>Powered by Jev · TypeSafe AI</span></footer>
    </main>
  );
}
