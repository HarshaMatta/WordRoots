import { describe, expect, it } from "vitest";
import { BRANCH_QUESTIONS, extractWords } from "./index.ts";

describe("extractWords", () => {
  it("preserves offsets across mixed scripts and ignores punctuation and numbers", () => {
    const text = "Hello, ఇల్లు! வீடு 123.";
    const { occurrences } = extractWords(text);
    expect(occurrences.map((item) => item.word)).toEqual(["Hello", "ఇల్లు", "வீடு"]);
    for (const occurrence of occurrences) {
      expect(text.slice(occurrence.start, occurrence.end)).toBe(occurrence.word);
    }
  });

  it("deduplicates within one sentence but separates sentence contexts", () => {
    const { occurrences, targets } = extractWords("Bank by the bank. Bank the fire.");
    expect(occurrences.filter((item) => item.normalized === "bank")).toHaveLength(3);
    expect(targets.filter((item) => item.word.toLowerCase() === "bank")).toHaveLength(2);
  });
});

describe("classification taxonomy", () => {
  it("stops at Romance, Sanskrit, and reconstructed Dravidian proto-branches", () => {
    expect(Object.keys(BRANCH_QUESTIONS.PIE.criteria)).toContain("Romance");
    expect(Object.keys(BRANCH_QUESTIONS.PIE.criteria)).toContain("Sanskrit");
    expect(Object.keys(BRANCH_QUESTIONS.PIE.criteria)).not.toContain("Italic");
    expect(Object.keys(BRANCH_QUESTIONS.PIE.criteria)).not.toContain("Indic");
    expect(Object.keys(BRANCH_QUESTIONS.Dravidian.criteria)).toEqual([
      "Proto-South Dravidian",
      "Proto-South-Central Dravidian",
      "Proto-Central Dravidian",
      "Proto-North Dravidian"
    ]);
  });
});
