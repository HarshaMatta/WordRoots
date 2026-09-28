import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { BRANCH_QUESTIONS, FAMILY_QUESTION, makeState, type ChoiceAnswer, type Family } from "../shared/src/index.ts";
import { SMOKE_CASES, type SmokeCase } from "./smoke-corpus.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const CONFIDENCE_FLOOR = 0.5;

interface ApiResponse {
  model?: string;
  answers?: Record<string, ChoiceAnswer>;
  usage?: Record<string, unknown>;
}

async function loadLocalEnv(): Promise<void> {
  if (process.env.TYPESAFE_API_KEY) return;
  try {
    const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const value = match[1].replace(/^(['"])(.*)\1$/, "$2");
      if (value) process.env.TYPESAFE_API_KEY = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function ask(key: string, state: unknown, question: unknown) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set. Export it or add it to .env.local.");
  const started = performance.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions: { [key]: question } }),
    signal: AbortSignal.timeout(10_000)
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`TypeSafe returned HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  const body = JSON.parse(bodyText) as ApiResponse;
  const answer = body.answers?.[key];
  if (!answer || answer.type !== "choice" || typeof answer.choice !== "string" || typeof answer.confidence !== "number") {
    throw new Error(`Malformed Choice response for ${key}`);
  }
  return { answer, usage: body.usage ?? {}, model: body.model, latencyMs: Math.round(performance.now() - started) };
}

async function classify(test: SmokeCase) {
  const state = makeState(test.word, test.sentence);
  const family = await ask("language_family", state, FAMILY_QUESTION);
  let branch: Awaited<ReturnType<typeof ask>> | null = null;
  if (family.answer.confidence >= CONFIDENCE_FLOOR && ["PIE", "Semitic", "Dravidian"].includes(family.answer.choice)) {
    branch = await ask("language_branch", state, BRANCH_QUESTIONS[family.answer.choice as Exclude<Family, "Other-Unclear">]);
  }
  const actualFamily = family.answer.confidence < CONFIDENCE_FLOOR ? "Uncertain" : family.answer.choice;
  const familyCorrect = actualFamily === test.expectedFamily;
  const branchCorrect = familyCorrect && branch?.answer.choice === test.expectedBranch;
  return {
    id: test.id,
    language: test.language,
    word: test.word,
    expectedFamily: test.expectedFamily,
    actualFamily,
    familyConfidence: family.answer.confidence,
    expectedBranch: test.expectedBranch,
    actualBranch: branch?.answer.choice ?? null,
    branchConfidence: branch?.answer.confidence ?? null,
    familyCorrect,
    branchCorrect,
    latencyMs: family.latencyMs + (branch?.latencyMs ?? 0),
    usage: { family: family.usage, branch: branch?.usage ?? null },
    model: family.model,
    source: test.source
  };
}

await loadLocalEnv();
if (!process.env.TYPESAFE_API_KEY) {
  console.error("Smoke test blocked: TYPESAFE_API_KEY is unavailable to this process. Export it in this shell or put it in .env.local.");
  process.exit(2);
}

console.log(`Running ${SMOKE_CASES.length} source-checked cases sequentially against ${MODEL}...`);
const results = [];
for (const test of SMOKE_CASES) {
  try {
    const result = await classify(test);
    results.push(result);
    console.log(`${result.familyCorrect && result.branchCorrect ? "PASS" : "FAIL"} ${result.id}: ${result.actualFamily}/${result.actualBranch ?? "—"} (${result.familyConfidence.toFixed(2)}/${result.branchConfidence?.toFixed(2) ?? "—"})`);
  } catch (error) {
    console.error(`ERROR ${test.id}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const exact = results.filter((result) => result.familyCorrect && result.branchCorrect).length;
const confidentErrors = results.filter((result) => !result.familyCorrect || !result.branchCorrect).filter((result) => result.familyConfidence >= 0.5 && (result.branchConfidence ?? 1) >= 0.5);
const report = {
  generatedAt: new Date().toISOString(),
  model: results[0]?.model ?? MODEL,
  confidenceFloor: CONFIDENCE_FLOOR,
  total: results.length,
  exactCorrect: exact,
  exactAccuracy: exact / results.length,
  confidentErrorCount: confidentErrors.length,
  results
};
await mkdir(new URL("../smoke-results", import.meta.url), { recursive: true });
const outputUrl = new URL("../smoke-results/latest.json", import.meta.url);
await writeFile(outputUrl, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`\nExact family+branch accuracy: ${exact}/${results.length} (${(100 * exact / results.length).toFixed(1)}%)`);
console.log(`Confident errors: ${confidentErrors.length}`);
console.log(`Report: ${outputUrl.pathname}`);
if (exact / results.length < 0.8 || confidentErrors.length > 2) {
  console.error("GATE FAILED: classification quality is below the provisional acceptance threshold (>=80% exact and <=2 confident errors).");
  process.exit(3);
}
console.log("GATE PASSED: results meet the provisional Phase 0 threshold. This sample does not establish calibration.");

