import type { Branch, Family } from "../shared/src/index.ts";

export interface SmokeCase {
  id: string;
  language: "English" | "Telugu" | "Tamil";
  word: string;
  sentence: string;
  expectedFamily: Family;
  expectedBranch: Branch | null;
  source: string;
}

const wiktionary = (entry: string) =>
  `https://en.wiktionary.org/wiki/${encodeURIComponent(entry)}`;

export const SMOKE_CASES: SmokeCase[] = [
  { id: "en-cow", language: "English", word: "cow", sentence: "The cow grazed in the field.", expectedFamily: "PIE", expectedBranch: "Germanic", source: wiktionary("cow") },
  { id: "en-beef", language: "English", word: "beef", sentence: "They served beef for dinner.", expectedFamily: "PIE", expectedBranch: "Romance", source: wiktionary("beef") },
  { id: "en-philosophy", language: "English", word: "philosophy", sentence: "She studied philosophy at university.", expectedFamily: "PIE", expectedBranch: "Hellenic", source: wiktionary("philosophy") },
  { id: "en-yoga", language: "English", word: "yoga", sentence: "Yoga is part of her morning routine.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("yoga") },
  { id: "en-bazaar", language: "English", word: "bazaar", sentence: "We walked through the crowded bazaar.", expectedFamily: "PIE", expectedBranch: "Iranian", source: wiktionary("bazaar") },
  { id: "en-robot", language: "English", word: "robot", sentence: "The robot moved the package.", expectedFamily: "PIE", expectedBranch: "Slavic", source: wiktionary("robot") },
  { id: "en-bard", language: "English", word: "bard", sentence: "The bard recited a poem.", expectedFamily: "PIE", expectedBranch: "Celtic", source: wiktionary("bard") },
  { id: "en-algebra", language: "English", word: "algebra", sentence: "Algebra is taught in this class.", expectedFamily: "Semitic", expectedBranch: "Arabic", source: wiktionary("algebra") },

  { id: "te-illu", language: "Telugu", word: "ఇల్లు", sentence: "ఇది మా ఇల్లు.", expectedFamily: "Dravidian", expectedBranch: "Proto-South-Central Dravidian", source: wiktionary("ఇల్లు") },
  { id: "te-neeru", language: "Telugu", word: "నీరు", sentence: "నాకు నీరు కావాలి.", expectedFamily: "Dravidian", expectedBranch: "Proto-South-Central Dravidian", source: wiktionary("నీరు") },
  { id: "te-kannu", language: "Telugu", word: "కన్ను", sentence: "ఆమె కన్ను అందంగా ఉంది.", expectedFamily: "Dravidian", expectedBranch: "Proto-South-Central Dravidian", source: wiktionary("కన్ను") },
  { id: "te-vidya", language: "Telugu", word: "విద్య", sentence: "విద్య చాలా ముఖ్యం.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("విద్య") },
  { id: "te-dharmam", language: "Telugu", word: "ధర్మం", sentence: "ధర్మం గురించి వారు చర్చించారు.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("ధర్మం") },
  { id: "te-raju", language: "Telugu", word: "రాజు", sentence: "రాజు సభకు వచ్చాడు.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("రాజు") },

  { id: "ta-veedu", language: "Tamil", word: "வீடு", sentence: "இது என் வீடு.", expectedFamily: "Dravidian", expectedBranch: "Proto-South Dravidian", source: wiktionary("வீடு") },
  { id: "ta-manai", language: "Tamil", word: "மனை", sentence: "அந்த மனை பெரியது.", expectedFamily: "Dravidian", expectedBranch: "Proto-South Dravidian", source: wiktionary("மனை") },
  { id: "ta-neer", language: "Tamil", word: "நீர்", sentence: "எனக்கு நீர் வேண்டும்.", expectedFamily: "Dravidian", expectedBranch: "Proto-South Dravidian", source: wiktionary("நீர்") },
  { id: "ta-tarumam", language: "Tamil", word: "தருமம்", sentence: "தருமம் பற்றி அவர் பேசினார்.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("தருமம்") },
  { id: "ta-tevan", language: "Tamil", word: "தேவன்", sentence: "தேவன் என்ற சொல்லை அவர் பயன்படுத்தினார்.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("தேவன்") },
  { id: "ta-matam", language: "Tamil", word: "மதம்", sentence: "அவர் மதம் பற்றி படித்தார்.", expectedFamily: "PIE", expectedBranch: "Sanskrit", source: wiktionary("மதம்") }
];
