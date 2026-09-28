import { extractWords, type ClassificationResult, type ClassificationTarget, type WordOccurrence } from "@jev-etymology/shared";

export const MAX_WORDS = 300;
export const BATCH_SIZE = 8;

export function prepareAnalysis(text: string) {
  return extractWords(text);
}

export function chunkTargets(targets: ClassificationTarget[], size = BATCH_SIZE): ClassificationTarget[][] {
  const chunks: ClassificationTarget[][] = [];
  for (let index = 0; index < targets.length; index += size) chunks.push(targets.slice(index, index + size));
  return chunks;
}

export function countFamilies(occurrences: WordOccurrence[], results: Record<string, ClassificationResult>) {
  const counts: Record<string, number> = {};
  for (const occurrence of occurrences) {
    const key = results[occurrence.classificationId]?.family ?? "Pending";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildCsvReport(
  text: string,
  occurrences: WordOccurrence[],
  results: Record<string, ClassificationResult>
): string {
  const rows = occurrences.map((occurrence) => {
    const result = results[occurrence.classificationId];
    const word = text.slice(occurrence.start, occurrence.end);
    const category = result
      ? result.branch ? `${result.family} · ${result.branch}` : result.family
      : "Pending";
    const percentage = result?.confidence == null ? "" : `${(result.confidence * 100).toFixed(1)}%`;
    return [word, category, percentage].map(csvCell).join(",");
  });
  return ["word,category,percentage", ...rows].join("\r\n");
}

export async function classifyBatch(
  endpoint: string,
  text: string,
  targets: ClassificationTarget[],
  signal: AbortSignal,
  onResult: (result: ClassificationResult) => void
) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targets }),
    signal
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Classification request failed (${response.status}): ${message.slice(0, 200)}`);
  }
  if (!response.body) throw new Error("The classification response did not include a stream");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onResult(JSON.parse(line) as ClassificationResult);
    }
    if (done) break;
  }
  if (buffer.trim()) onResult(JSON.parse(buffer) as ClassificationResult);
}
