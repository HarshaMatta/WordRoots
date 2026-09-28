import { describe, expect, it } from "vitest";
import { buildCsvReport, chunkTargets, countFamilies, prepareAnalysis } from "./analysis";

describe("analysis helpers", () => {
  it("limits batches to eight targets", () => {
    const targets = Array.from({ length: 17 }, (_, index) => ({ id: `${index}`, word: "x", start: 0, end: 1, sentenceStart: 0, sentenceEnd: 1 }));
    expect(chunkTargets(targets).map((batch) => batch.length)).toEqual([8, 8, 1]);
  });

  it("counts occurrences separately from deduplicated targets", () => {
    const parsed = prepareAnalysis("Root root root.");
    expect(parsed.occurrences).toHaveLength(3);
    expect(parsed.targets).toHaveLength(1);
  });

  it("weights aggregate families by occurrence", () => {
    const parsed = prepareAnalysis("Root root root.");
    const id = parsed.targets[0].id;
    const counts = countFamilies(parsed.occurrences, {
      [id]: { id, status: "complete", family: "PIE", branch: "Germanic", confidence: 0.9, familyConfidence: 0.9, branchConfidence: 0.9 }
    });
    expect(counts.PIE).toBe(3);
  });

  it("builds an occurrence-level CSV report with category and confidence", () => {
    const text = 'Root "root".';
    const parsed = prepareAnalysis(text);
    const results = Object.fromEntries(parsed.targets.map((target) => [
      target.id,
      { id: target.id, status: "complete" as const, family: "PIE" as const, branch: "Romance" as const, confidence: 0.856, familyConfidence: 0.9, branchConfidence: 0.856 }
    ]));
    expect(buildCsvReport(text, parsed.occurrences, results)).toBe([
      "word,category,percentage",
      "Root,PIE · Romance,85.6%",
      "root,PIE · Romance,85.6%"
    ].join("\r\n"));
  });
});
