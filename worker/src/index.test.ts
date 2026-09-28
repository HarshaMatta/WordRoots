import { describe, expect, it, vi } from "vitest";
import { askJev, classifyTarget, handleRequest, type Env } from "./index";
import type { ClassificationTarget } from "@jev-etymology/shared";

const env: Env = { TYPESAFE_API_KEY: "test-only", ALLOWED_ORIGINS: "https://example.test" };
const target: ClassificationTarget = { id: "word-1", word: "cow", start: 4, end: 7, sentenceStart: 0, sentenceEnd: 8 };

function choice(name: string, confidence: number) {
  return new Response(JSON.stringify({ answers: { language_family: { type: "choice", choice: name, confidence, probabilities: { [name]: 1 } }, language_branch: { type: "choice", choice: name, confidence, probabilities: { [name]: 1 } } } }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("classifyTarget", () => {
  it("stops after an uncertain family", async () => {
    const fetcher = vi.fn(async () => choice("PIE", 0.49)) as unknown as typeof fetch;
    const result = await classifyTarget(env, "The cow.", target, fetcher);
    expect(result.family).toBe("Uncertain");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cascades to the matching branch", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(choice("PIE", 0.9))
      .mockResolvedValueOnce(choice("Germanic", 0.7)) as unknown as typeof fetch;
    const result = await classifyTarget(env, "The cow.", target, fetcher);
    expect(result).toMatchObject({ status: "complete", family: "PIE", branch: "Germanic", confidence: 0.7 });
  });

  it("preserves a family when branch classification fails", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(choice("PIE", 0.9))
      .mockResolvedValue(new Response("bad", { status: 422 })) as unknown as typeof fetch;
    const result = await classifyTarget(env, "The cow.", target, fetcher);
    expect(result).toMatchObject({ status: "complete", family: "PIE", branch: null, detail: "Branch classification could not reach TypeSafe" });
  });

  it("returns a safe authentication diagnostic without upstream content", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret upstream body", { status: 401 })) as unknown as typeof fetch;
    const result = await classifyTarget(env, "The cow.", target, fetcher);
    expect(result.detail).toBe("Family classification failed: TypeSafe rejected the API key");
    expect(JSON.stringify(result)).not.toContain("secret upstream body");
  });
});

describe("askJev", () => {
  it("retries one transient upstream failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 529 }))
      .mockResolvedValueOnce(choice("PIE", 0.9)) as unknown as typeof fetch;
    const answer = await askJev(env, {}, "language_family", {}, fetcher);
    expect(answer.choice).toBe("PIE");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed successful responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    await expect(askJev(env, {}, "language_family", {}, fetcher)).rejects.toThrow("Malformed");
  });
});

describe("handleRequest validation", () => {
  it("explains the service at the root URL", async () => {
    const response = await handleRequest(new Request("https://worker.test/"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", endpoint: "POST /classify" });
  });

  it("rejects malformed JSON", async () => {
    const response = await handleRequest(new Request("https://worker.test/classify", { method: "POST", body: "{" }), env);
    expect(response.status).toBe(400);
  });

  it("rejects disallowed origins", async () => {
    const response = await handleRequest(new Request("https://worker.test/classify", { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" }), env);
    expect(response.status).toBe(403);
  });

  it("rejects paragraphs over 300 words before upstream calls", async () => {
    const text = Array.from({ length: 301 }, () => "word").join(" ");
    const response = await handleRequest(new Request("https://worker.test/classify", { method: "POST", body: JSON.stringify({ text, targets: [{ id: "1", word: "word", start: 0, end: 4, sentenceStart: 0, sentenceEnd: text.length }] }) }), env);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("300");
  });

  it("returns 429 when the rate limiter rejects the request", async () => {
    const limitedEnv: Env = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const response = await handleRequest(new Request("https://worker.test/classify", { method: "POST", body: "{}" }), limitedEnv);
    expect(response.status).toBe(429);
  });
});
