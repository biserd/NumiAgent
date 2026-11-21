"""Calibrate on the published train specimens and evaluate the untouched test specimens."""
import argparse
import json
from pathlib import Path
import random


def accept(prediction, policy):
    return (policy["max_distance"] is not None and prediction["id"] is not None
            and prediction["distance"] <= policy["max_distance"]
            and prediction["margin"] >= policy["min_margin"])


def count(pairs, policy):
    correct = false_known = false_unknown = 0
    for row, prediction in pairs:
        if accept(prediction, policy):
            if not row["gallery"]:
                false_unknown += 1
            elif prediction["id"] == row["id"]:
                correct += 1
            else:
                false_known += 1
    return {
        "correct": correct,
        "wrong": false_known + false_unknown,
        "wrong_known": false_known,
        "wrong_unknown": false_unknown,
        "abstained": len(pairs) - correct - false_known - false_unknown,
        "known": sum(bool(row["gallery"]) for row, _ in pairs),
        "unknown": sum(not row["gallery"] for row, _ in pairs),
        "top1_known": sum(bool(row["gallery"]) and prediction["id"] == row["id"] for row, prediction in pairs),
    }


def calibrate(pairs):
    candidates = [p for _, p in pairs if p["id"] is not None]
    best = (0, float("-inf"), float("-inf"))
    policy = {"max_distance": None, "min_margin": None}
    for distance in sorted({p["distance"] for p in candidates}):
        for margin in sorted({0.0, *(p["margin"] for p in candidates)}):
            setting = {"max_distance": distance, "min_margin": margin}
            metrics = count(pairs, setting)
            rank = metrics["correct"], -distance, margin
            if metrics["wrong"] == 0 and metrics["correct"] > 0 and rank > best:
                best, policy = rank, setting
    return policy


def paired_interval(deltas, seed=21):
    rng = random.Random(seed)
    estimates = sorted(sum(rng.choices(deltas, k=len(deltas))) * 100 / len(deltas) for _ in range(10000))
    return [estimates[250], estimates[9749]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("predictions", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    predictions = json.loads(args.predictions.read_text(encoding="utf-8"))
    rows = {row["id"]: row for row in manifest["rows"]}
    score = {}
    correct_by_method = {}
    for method in ("ocr", "apple", "dino"):
        pairs = [(rows[p["query"]], p) for p in predictions["predictions"] if p["method"] == method]
        assert sorted(row["id"] for row, _ in pairs) == sorted(rows), "Missing or repeated query"
        calibration = [(r, p) for r, p in pairs if r["split"] == "calibration"]
        test = [(r, p) for r, p in pairs if r["split"] == "test"]
        policy = calibrate(calibration)
        score[method] = {"policy": policy, "calibration": count(calibration, policy), "test": count(test, policy)}
        correct_by_method[method] = {
            r["id"]: int(bool(r["gallery"]) and accept(p, policy) and p["id"] == r["id"])
            for r, p in test
        }
    comparisons = {}
    for candidate, baseline in (("apple", "ocr"), ("dino", "ocr"), ("dino", "apple")):
        differences = [value - correct_by_method[baseline][key] for key, value in correct_by_method[candidate].items()]
        extra_wrong = score[candidate]["test"]["wrong"] - score[baseline]["test"]["wrong"]
        comparisons[f"{candidate}_vs_{baseline}"] = {
            "additional_correct": sum(differences),
            "additional_wrong": extra_wrong,
            "paired_95_percent_ci_per_100": paired_interval(differences),
            "improves_without_more_errors": sum(differences) > 0 and extra_wrong <= 0,
        }
    report = {"runtime": predictions["runtime"], "methods": score, "comparisons": comparisons}
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
