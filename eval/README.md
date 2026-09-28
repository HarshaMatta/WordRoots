# Milestone 1: evidence-based evaluation

This directory does not change the running application or call an API. Python's standard library is sufficient.

- `gold.csv`: review queue seeded from the words in your supplied examples. Every row starts `verified=false`; lemma, etymologies, and source citations are deliberately blank.
- `evaluate.py`: compares saved predictions against verified gold, grouped by language.
- `test_evaluate.py`: synthetic fixtures verify scoring and confidence rules. They assert no real etymologies.

Run from the project root:

```sh
python3 eval/evaluate.py
python3 -m unittest discover -s eval -p 'test_*.py'
python3 eval/evaluate.py --predictions predictions.jsonl --output report.json
```

## Verify the gold seed

Language tags are provisional input metadata: en, fr, de, es, te, ta, kn, hi, mr, bn. The notes grouped some Devanagari examples across languages, so their Hindi/Marathi assignment needs your review. This seed does not perform automatic language detection. The supplied notes are not source verification, and their precision/recall figures or DEDR numbers are not imported as truth.

For each row, check the language and surface spelling, enter the lemma, cite an actual source entry in `source`, and record both origins. Only then set `verified=true`.

`proximate` and `ultimate` use `inherited:CODE`, `borrowed:CODE`, or `derived:CODE`. Use consistent source-language ISO codes; a later ingest milestone must explicitly document any reconstructed-language code extensions. The fields also accept `unknown` or `disputed` when that is the verified source's conclusion. Do not convert missing research into a verified unknown. Here `ultimate` means the deepest source supported by the cited evidence, not a guessed prehistoric ancestor.

## Prediction contract

Supply JSONL with one object per `(language, word)`; matching preserves case and normalizes Unicode to NFC. Required fields are `word`, `language`, `lemma`, `proximate`, `ultimate`, `tier`, and `certainty`. Each origin can be a `type:CODE` string or an object containing `type` and `source_lang_iso`. `unknown` and `disputed` are also accepted origin strings. Additional fields, including evidence forms, are allowed but are not yet scored.

`tier` is `lookup` or `llm-guess`; `certainty` is `attested`, `probable`, `disputed`, or `unknown`. Lookup results require a nonempty `source` entry reference. Duplicate keys and malformed inputs are rejected. The existing browser CSV has category labels rather than etymons, so it is not silently converted into this contract. No current-model predictions or fabricated baseline have been supplied.

## Scoring

Exact accuracy requires lemma, proximate, and ultimate all to match. The denominator is every verified gold row in that language, including missing predictions. Coverage (`predicted / verified`) is shown separately; JSON also includes individual lemma/proximate/ultimate match counts. Unverified rows never contribute to scores or error lists. With no verified rows accuracy is N/A.

For the requested confident-error list, an incorrect result is flagged if it is a lookup with attested/probable certainty, or an LLM guess claiming attested certainty. Unknown/disputed results are not confident. This explicit evaluation policy does not imply that every dictionary entry is correct or that an LLM's claim is evidence. All errors, including missing predictions, remain in the full report.

Stop after this milestone. Human verification and prediction files are needed to measure before/after accuracy; lookup ingestion, lemmatization, LLM fallback, and DEDR integration are not implemented here.
