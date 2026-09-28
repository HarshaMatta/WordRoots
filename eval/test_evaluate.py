"""Synthetic fixtures test scoring mechanics, not real etymologies."""
import unittest
from evaluate import evaluate


def gold(word="example", verified="true"):
    return dict(word=word, language="test", lemma=word, proximate="borrowed:src", ultimate="inherited:root", source="synthetic fixture", verified=verified)


def prediction(word="example", **changes):
    row = dict(word=word, language="test", lemma=word,
               proximate={"type": "borrowed", "source_lang_iso": "src"},
               ultimate={"type": "inherited", "source_lang_iso": "root"},
               source="synthetic fixture", tier="lookup", certainty="attested")
    return row | changes


class EvaluationTests(unittest.TestCase):
    def test_unverified_rows_never_count(self):
        report = evaluate([gold(verified="false")], [prediction(lemma="wrong")])
        self.assertIsNone(report["languages"]["test"]["accuracy"])
        self.assertEqual(report["confident_errors"], [])

    def test_missing_predictions_stay_in_denominator(self):
        report = evaluate([gold(), gold("missing")], [prediction()])
        self.assertEqual(report["languages"]["test"]["accuracy"], 0.5)
        self.assertEqual(report["languages"]["test"]["predicted"], 1)

    def test_lookup_error_is_flagged(self):
        report = evaluate([gold()], [prediction(ultimate="borrowed:wrong")])
        self.assertEqual(len(report["confident_errors"]), 1)
        self.assertEqual(report["languages"]["test"]["proximate"], 1)
        self.assertEqual(report["languages"]["test"]["ultimate"], 0)

    def test_disputed_and_probable_guesses_are_not_confident(self):
        for changes in ({"certainty": "disputed"}, {"tier": "llm-guess", "certainty": "probable"}):
            report = evaluate([gold()], [prediction(lemma="wrong", **changes)])
            self.assertEqual(len(report["errors"]), 1)
            self.assertEqual(report["confident_errors"], [])

    def test_same_spelling_is_matched_by_language(self):
        rows = [gold(), gold() | {"language": "other"}]
        report = evaluate(rows, [prediction()])
        self.assertEqual(report["languages"]["test"]["accuracy"], 1)
        self.assertEqual(report["languages"]["other"]["accuracy"], 0)


if __name__ == "__main__":
    unittest.main()
