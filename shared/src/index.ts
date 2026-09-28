export type Family = "PIE" | "Semitic" | "Dravidian" | "Other-Unclear";
export type Branch =
  | "Germanic"
  | "Romance"
  | "Hellenic"
  | "Sanskrit"
  | "Iranian"
  | "Slavic"
  | "Celtic"
  | "Other-PIE"
  | "Arabic"
  | "Hebrew"
  | "Aramaic"
  | "Other-Semitic"
  | "Proto-South Dravidian"
  | "Proto-South-Central Dravidian"
  | "Proto-Central Dravidian"
  | "Proto-North Dravidian";

export type DisplayFamily = Family | "Uncertain" | "Unclassified";

export interface ClassificationTarget {
  id: string;
  word: string;
  start: number;
  end: number;
  sentenceStart: number;
  sentenceEnd: number;
}

export interface ClassifyRequest {
  text: string;
  targets: ClassificationTarget[];
}

export interface ClassificationResult {
  id: string;
  status: "complete" | "error";
  family: DisplayFamily;
  branch: Branch | null;
  confidence: number | null;
  familyConfidence: number | null;
  branchConfidence: number | null;
  detail?: string;
}

export interface WordOccurrence extends ClassificationTarget {
  normalized: string;
  classificationId: string;
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export const FAMILY_QUESTION: ChoiceQuestion = {
  type: "choice",
  instructions:
    "Classify the identifiable root-source language family of the target word. Trace through intermediary donor languages rather than classifying the immediate donor. Use the surrounding sentence only to identify the intended word and sense.",
  criteria: {
    PIE: "Indo-European family, including Germanic, Romance, Hellenic, Sanskrit-derived, Iranian, Slavic, Celtic, and other Indo-European sources.",
    Semitic: "Semitic family, including Arabic, Hebrew, Aramaic, and other Semitic sources.",
    Dravidian: "Dravidian family, including South, South-Central, Central, and North Dravidian sources.",
    "Other-Unclear": "A different language family, a language isolate, or a genuinely uncertain root source."
  }
};

export const BRANCH_QUESTIONS: Record<"PIE" | "Semitic" | "Dravidian", ChoiceQuestion> = {
  PIE: {
    type: "choice",
    instructions: "Given that the target word has an Indo-European root source, classify that root source by branch.",
    criteria: {
      Germanic: "English/Old English, Norse, German, Dutch, or another Germanic source.",
      Romance: "Latin or a Romance-language root source. Stop at Romance; do not distinguish French, Spanish, Italian, Portuguese, or Latin.",
      Hellenic: "Greek source, including Greek-root scientific coinages.",
      Sanskrit: "A Sanskrit root source, whether direct or transmitted through a later Indo-Aryan or Dravidian language. Stop at Sanskrit.",
      Iranian: "Persian or another Iranian source.",
      Slavic: "Russian, Polish, Czech, or another Slavic source.",
      Celtic: "Irish, Welsh, Scottish Gaelic, or another Celtic source.",
      "Other-PIE": "Another or uncertain Indo-European branch."
    }
  },
  Semitic: {
    type: "choice",
    instructions: "Given that the target word has a Semitic root source, classify that root source by branch.",
    criteria: {
      Arabic: "Arabic source, whether direct or transmitted through another language.",
      Hebrew: "Hebrew source.",
      Aramaic: "Aramaic source.",
      "Other-Semitic": "Another or ambiguous Semitic source."
    }
  },
  Dravidian: {
    type: "choice",
    instructions: "Given that the target word has a Dravidian root source, classify it by the most specific reconstructed proto-branch below. Stop at the proto-language level; do not name a modern language.",
    criteria: {
      "Proto-South Dravidian": "The reconstructed ancestor of Tamil, Kannada, Malayalam, Tulu, and related South Dravidian languages.",
      "Proto-South-Central Dravidian": "The reconstructed ancestor of Telugu, Gondi, and related South-Central Dravidian languages.",
      "Proto-Central Dravidian": "The reconstructed ancestor of Kolami, Parji, and related Central Dravidian languages.",
      "Proto-North Dravidian": "The reconstructed ancestor of Brahui, Kurukh, Malto, and related North Dravidian languages."
    }
  }
};

export function makeState(word: string, sentence: string) {
  return {
    target_word: word,
    surrounding_sentence: sentence,
    classification_policy:
      "Classify the target word's identifiable root source, following borrowings through intermediary languages. Do not classify the sentence as a whole."
  };
}

export const FAMILY_COLORS: Record<DisplayFamily | "Pending", string> = {
  PIE: "#4778d7",
  Semitic: "#d3912c",
  Dravidian: "#339b73",
  "Other-Unclear": "#7d8491",
  Uncertain: "#a279b7",
  Unclassified: "#b15d65",
  Pending: "#b9bec7"
};

export const BRANCH_COLORS: Partial<Record<Branch, string>> = {
  Germanic: "#4778d7",
  Romance: "#7297df",
  Hellenic: "#315faa",
  Sanskrit: "#88a6e3",
  Iranian: "#294d8b",
  Slavic: "#5f7fc0",
  Celtic: "#416da9",
  "Other-PIE": "#7f91b8",
  Arabic: "#d3912c",
  Hebrew: "#e0aa55",
  Aramaic: "#ba7620",
  "Other-Semitic": "#ad8a59",
  "Proto-South Dravidian": "#339b73",
  "Proto-South-Central Dravidian": "#59ae88",
  "Proto-Central Dravidian": "#247b5a",
  "Proto-North Dravidian": "#76b89c"
};

export function extractWords(text: string): { occurrences: WordOccurrence[]; targets: ClassificationTarget[] } {
  const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const occurrences: WordOccurrence[] = [];
  const targetsByKey = new Map<string, ClassificationTarget>();
  for (const sentencePart of sentenceSegmenter.segment(text)) {
    const sentenceStart = sentencePart.index;
    const sentenceEnd = sentenceStart + sentencePart.segment.length;
    const context = sentencePart.segment.normalize("NFC").trim();
    for (const wordPart of wordSegmenter.segment(sentencePart.segment)) {
      if (!wordPart.isWordLike || /^\p{N}+$/u.test(wordPart.segment)) continue;
      const start = sentenceStart + wordPart.index;
      const end = start + wordPart.segment.length;
      const normalized = wordPart.segment.normalize("NFC").toLocaleLowerCase();
      const key = `${normalized}\u0000${context}`;
      let target = targetsByKey.get(key);
      if (!target) {
        target = {
          id: `word-${targetsByKey.size + 1}`,
          word: wordPart.segment,
          start,
          end,
          sentenceStart,
          sentenceEnd
        };
        targetsByKey.set(key, target);
      }
      occurrences.push({
        id: `occurrence-${occurrences.length + 1}`,
        word: wordPart.segment,
        start,
        end,
        sentenceStart,
        sentenceEnd,
        normalized,
        classificationId: target.id
      });
    }
  }
  return { occurrences, targets: [...targetsByKey.values()] };
}
