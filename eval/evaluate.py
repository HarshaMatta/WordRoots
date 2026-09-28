"""Offline evaluation of human-verified gold rows; standard library only."""
import argparse
import csv
import json
import unicodedata
from pathlib import Path


def key(row):
    # Preserve case: the seed deliberately includes both El and el.
    return row["language"], unicodedata.normalize("NFC", row["word"])


def origin(value):
    """Gold encodes type:ISO; predictions may use that or an etymon object."""
    if isinstance(value, dict):
        return f'{value.get("type", "")}:{value.get("source_lang_iso", "")}'
    return value or ""


def read_gold(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"word", "language", "lemma", "proximate", "ultimate", "source", "verified"}
        if set(reader.fieldnames or []) != required:
            raise ValueError("Gold must have exactly: " + ",".join(sorted(required)))
        rows = list(reader)
    seen = set()
    for row in rows:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("Malformed gold CSV row")
        if not row["word"] or not row["language"] or row["verified"] not in {"true", "false"}:
            raise ValueError("Gold needs word, language, and verified=true|false")
        if key(row) in seen:
            raise ValueError(f"Duplicate gold key: {key(row)}")
        seen.add(key(row))
        if row["verified"] == "true":
            if not row["lemma"] or not row["source"]:
                raise ValueError("Verified rows require a lemma and source citation")
            for field in ("proximate", "ultimate"):
                value = row[field]
                if value not in {"unknown", "disputed"} and not (
                    value.startswith(("inherited:", "borrowed:", "derived:"))
                    and value.split(":", 1)[1]
                ):
                    raise ValueError(f"Invalid verified {field}: {value!r}")
    return rows


def read_predictions(path):
    if path is None:
        return []
    with path.open(encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not all(isinstance(row.get(f), str) and row[f] for f in ("word", "language", "lemma")):
            raise ValueError("Predictions need word, language, and lemma strings")
        if key(row) in seen:
            raise ValueError(f"Duplicate prediction key: {key(row)}")
        seen.add(key(row))
        if row.get("tier") not in {"lookup", "llm-guess"}:
            raise ValueError("Prediction tier must be lookup or llm-guess")
        if row.get("certainty") not in {"attested", "probable", "disputed", "unknown"}:
            raise ValueError("Invalid prediction certainty")
        if row["tier"] == "lookup" and not row.get("source"):
            raise ValueError("Lookup predictions require a source entry reference")
        for field in ("proximate", "ultimate"):
            value = origin(row.get(field))
            if value not in {"unknown", "disputed"} and not (
                value.startswith(("inherited:", "borrowed:", "derived:"))
                and value.split(":", 1)[1]
            ):
                raise ValueError(f"Invalid prediction {field}")
    return rows


def evaluate(gold, predictions):
    indexed = {key(row): row for row in predictions}
    languages = {}
    errors = []
    for row in gold:
        counts = languages.setdefault(row["language"], dict(seed=0, verified=0, predicted=0, exact=0, lemma=0, proximate=0, ultimate=0))
        counts["seed"] += 1
        if row["verified"] != "true":
            continue
        counts["verified"] += 1
        prediction = indexed.get(key(row))
        if prediction is None:
            errors.append({"word": row["word"], "language": row["language"], "reason": "missing prediction", "confident": False})
            continue
        counts["predicted"] += 1
        matches = {
            "lemma": unicodedata.normalize("NFC", prediction["lemma"]) == unicodedata.normalize("NFC", row["lemma"]),
            "proximate": origin(prediction.get("proximate")) == row["proximate"],
            "ultimate": origin(prediction.get("ultimate")) == row["ultimate"],
        }
        for field, correct in matches.items():
            counts[field] += int(correct)
        counts["exact"] += int(all(matches.values()))
        if not all(matches.values()):
            # A declared confidence policy, not a claim that lookups are infallible.
            confident = prediction["certainty"] not in {"unknown", "disputed"} and (
                prediction["tier"] == "lookup" or prediction["certainty"] == "attested"
            )
            errors.append({"word": row["word"], "language": row["language"], "tier": prediction["tier"],
                           "certainty": prediction["certainty"], "confident": confident,
                           "expected": {f: row[f] for f in matches},
                           "actual": {f: origin(prediction.get(f)) for f in matches},
                           "source": prediction.get("source", "")})
    for counts in languages.values():
        counts["accuracy"] = counts["exact"] / counts["verified"] if counts["verified"] else None
    gold_keys = {key(row) for row in gold}
    return {"languages": languages, "errors": errors,
            "confident_errors": [e for e in errors if e["confident"]],
            "extra_predictions": sum(key(row) not in gold_keys for row in predictions)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gold", type=Path, default=Path(__file__).with_name("gold.csv"))
    parser.add_argument("--predictions", type=Path, help="One structured result per JSONL line")
    parser.add_argument("--output", type=Path, help="Optional JSON report")
    args = parser.parse_args()
    try:
        report = evaluate(read_gold(args.gold), read_predictions(args.predictions))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(2, f"Evaluation error: {error}\n")
    print("language  seed verified predicted exact accuracy")
    for language, counts in sorted(report["languages"].items()):
        accuracy = "N/A" if counts["accuracy"] is None else f'{counts["accuracy"]:.1%}'
        print(f'{language:8} {counts["seed"]:4} {counts["verified"]:8} {counts["predicted"]:9} {counts["exact"]:5} {accuracy}')
    print(f'Confident errors: {len(report["confident_errors"])}; unmatched predictions: {report["extra_predictions"]}')
    for error in report["errors"]:
        print(json.dumps(error, ensure_ascii=False))
    if not any(c["verified"] for c in report["languages"].values()):
        print("No verified gold rows: accuracy and confident-error rates cannot yet be measured.")
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
