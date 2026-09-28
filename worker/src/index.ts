import {
  BRANCH_QUESTIONS,
  FAMILY_QUESTION,
  extractWords,
  makeState,
  type Branch,
  type ChoiceAnswer,
  type ClassificationResult,
  type ClassificationTarget,
  type ClassifyRequest,
  type Family
} from "@jev-etymology/shared";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_WORDS = 300;
const MAX_TARGETS = 8;
const CONFIDENCE_FLOOR = 0.5;
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

export interface Env {
  TYPESAFE_API_KEY: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}

interface SystemOneResponse {
  answers?: Record<string, ChoiceAnswer>;
}

function safeUpstreamDetail(error: unknown, stage: "Family" | "Branch"): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) return `${stage} classification failed: TypeSafe rejected the API key`;
  if (message.includes("HTTP 429")) return `${stage} classification failed: TypeSafe rate limit exceeded`;
  if (message.includes("HTTP 529") || /HTTP 5\d\d/.test(message)) return `${stage} classification failed: TypeSafe is temporarily unavailable`;
  if (message.startsWith("Malformed")) return `${stage} classification failed: TypeSafe returned an unexpected response`;
  if (error instanceof DOMException && error.name === "TimeoutError") return `${stage} classification timed out`;
  return `${stage} classification could not reach TypeSafe`;
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

function jsonError(status: number, message: string, origin: string | null, env: Env): Response {
  return Response.json({ error: message }, { status, headers: corsHeaders(origin, env) });
}

function validateTarget(text: string, target: ClassificationTarget, validOffsets: Set<string>): boolean {
  if (!target || typeof target.id !== "string" || typeof target.word !== "string") return false;
  const values = [target.start, target.end, target.sentenceStart, target.sentenceEnd];
  if (!values.every(Number.isInteger)) return false;
  if (target.start < target.sentenceStart || target.end > target.sentenceEnd || target.end <= target.start || target.sentenceEnd > text.length) return false;
  if (text.slice(target.start, target.end) !== target.word) return false;
  return validOffsets.has(`${target.start}:${target.end}:${target.sentenceStart}:${target.sentenceEnd}`);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function askJev(
  env: Env,
  state: unknown,
  questionId: string,
  question: unknown,
  fetcher: typeof fetch = fetch
): Promise<ChoiceAnswer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "jev-latest", state, questions: { [questionId]: question } }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        const message = `TypeSafe HTTP ${response.status}`;
        if (!RETRYABLE.has(response.status) || attempt === 1) throw new Error(message);
        lastError = new Error(message);
      } else {
        const payload = (await response.json()) as SystemOneResponse;
        const answer = payload.answers?.[questionId];
        if (!answer || answer.type !== "choice" || typeof answer.choice !== "string" || typeof answer.confidence !== "number" || !answer.probabilities) {
          throw new Error("Malformed TypeSafe Choice response");
        }
        return answer;
      }
    } catch (error) {
      lastError = error;
      if (
        attempt === 1 ||
        (error instanceof Error && error.message.startsWith("Malformed")) ||
        (error instanceof Error && error.message.startsWith("TypeSafe HTTP") && !/429|5\d\d/.test(error.message))
      ) throw error;
    }
    await sleep(250 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error("TypeSafe request failed");
}

export async function classifyTarget(env: Env, text: string, target: ClassificationTarget, fetcher: typeof fetch = fetch): Promise<ClassificationResult> {
  const state = makeState(target.word, text.slice(target.sentenceStart, target.sentenceEnd));
  let family: ChoiceAnswer;
  try {
    family = await askJev(env, state, "language_family", FAMILY_QUESTION, fetcher);
  } catch (error) {
    return { id: target.id, status: "error", family: "Unclassified", branch: null, confidence: null, familyConfidence: null, branchConfidence: null, detail: safeUpstreamDetail(error, "Family") };
  }
  if (family.confidence < CONFIDENCE_FLOOR) {
    return { id: target.id, status: "complete", family: "Uncertain", branch: null, confidence: family.confidence, familyConfidence: family.confidence, branchConfidence: null };
  }
  const familyName = family.choice as Family;
  if (familyName === "Other-Unclear") {
    return { id: target.id, status: "complete", family: familyName, branch: null, confidence: family.confidence, familyConfidence: family.confidence, branchConfidence: null };
  }
  if (!(familyName in BRANCH_QUESTIONS)) {
    return { id: target.id, status: "error", family: "Unclassified", branch: null, confidence: null, familyConfidence: family.confidence, branchConfidence: null, detail: "Unexpected family response" };
  }
  try {
    const branch = await askJev(env, state, "language_branch", BRANCH_QUESTIONS[familyName as Exclude<Family, "Other-Unclear">], fetcher);
    return {
      id: target.id,
      status: "complete",
      family: familyName,
      branch: branch.choice as Branch,
      confidence: Math.min(family.confidence, branch.confidence),
      familyConfidence: family.confidence,
      branchConfidence: branch.confidence
    };
  } catch (error) {
    return {
      id: target.id,
      status: "complete",
      family: familyName,
      branch: null,
      confidence: family.confidence,
      familyConfidence: family.confidence,
      branchConfidence: null,
      detail: safeUpstreamDetail(error, "Branch")
    };
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const current = items[next++];
      await task(current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, env);
  if (request.method === "OPTIONS") {
    if (origin && !("Access-Control-Allow-Origin" in headers)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") {
    return Response.json(
      {
        service: "jev-etymology-api",
        status: "ok",
        message: "This is the API service. Open the GitHub Pages frontend to use the etymology explorer.",
        endpoint: "POST /classify"
      },
      { headers: { ...headers, "Cache-Control": "no-store" } }
    );
  }
  if (request.method !== "POST" || url.pathname !== "/classify") return jsonError(404, "Not found", origin, env);
  if (origin && !("Access-Control-Allow-Origin" in headers)) return jsonError(403, "Origin is not allowed", origin, env);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) return jsonError(429, "Rate limit exceeded", origin, env);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError(413, "Request body is too large", origin, env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonError(413, "Request body is too large", origin, env);
  let input: ClassifyRequest;
  try { input = JSON.parse(raw) as ClassifyRequest; } catch { return jsonError(400, "Invalid JSON", origin, env); }
  if (typeof input.text !== "string" || !Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MAX_TARGETS) return jsonError(400, "Expected text and 1-8 targets", origin, env);
  const parsed = extractWords(input.text);
  if (parsed.occurrences.length > MAX_WORDS) return jsonError(400, `Input exceeds ${MAX_WORDS} words`, origin, env);
  const offsets = new Set(parsed.occurrences.map((item) => `${item.start}:${item.end}:${item.sentenceStart}:${item.sentenceEnd}`));
  if (new Set(input.targets.map((target) => target.id)).size !== input.targets.length || !input.targets.every((target) => validateTarget(input.text, target, offsets))) return jsonError(400, "One or more targets are invalid", origin, env);

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  void runWithConcurrency(input.targets, 4, async (target) => {
    const result = await classifyTarget(env, input.text, target);
    await writer.write(encoder.encode(`${JSON.stringify(result)}\n`));
  }).finally(() => writer.close());
  return new Response(stream.readable, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
