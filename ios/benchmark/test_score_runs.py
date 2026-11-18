import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from score_runs import calibrate


class ScoreRunsTests(unittest.TestCase):
    def test_threshold_uses_calibration_wrong_budget(self):
        rows = [
            {"confidence": 5, "ranked": [{"id": "type"}], "catalog_id": "type"},
            {"confidence": 4, "ranked": [{"id": "type"}], "catalog_id": ""},
            {"confidence": 3, "ranked": [{"id": "type"}], "catalog_id": "type"},
        ]
        self.assertEqual(calibrate(rows, 0), (1, 0, 5))

    def test_emits_scorer_csv_and_category_decisions(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            arguments = []
            for model in ("ocr", "mobilenet-v3-small"):
                rows = []
                for category in ("coin", "banknote"):
                    for split in ("calibration", "test"):
                        for index in range(30):
                            label = "" if index < 4 else category + "-type"
                            accepted = bool(label) and (model != "ocr" or index >= 14)
                            rows.append({
                                "specimen_id": f"{category}-{split}-{index}", "category": category, "split": split,
                                "catalog_id": label, "ranked": [{"id": label, "score": 4}] if accepted else [],
                                "confidence": 5 if accepted else -100,
                                "truth_fields": {"year": "2007"} if label else {},
                                "first_fields": {"year": "2007"} if accepted else {},
                            })
                path = directory / (model + ".json")
                path.write_text(json.dumps({"model": model, "device": "synthetic", "os": "synthetic",
                                           "reference_count": 2, "suite_sha256": "fixture", "predictions": rows}),
                                encoding="utf-8")
                arguments.append(str(path))
            output = directory / "scored"
            subprocess.run([sys.executable, str(Path(__file__).with_name("score_runs.py")),
                            str(output), *arguments], check=True, capture_output=True, text=True)
            result = json.loads((output / "comparison.json").read_text(encoding="utf-8"))
            decision = result["comparisons"]["mobilenet-v3-small"]["decision_by_category"]
            self.assertTrue(decision["coin"]["meets_gain_rule"])
            self.assertTrue(decision["banknote"]["same_confident_wrong_rate"])
            self.assertEqual(result["field_accuracy"]["ocr"]["coin"]["year"]["abstained"], 10)
            self.assertTrue((output / "truth.csv").is_file())


if __name__ == "__main__":
    unittest.main()
