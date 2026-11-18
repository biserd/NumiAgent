"""Freeze thresholds on calibration observations and score held-out Core ML runs."""

import argparse
import csv
import json
import math
import subprocess
import sys
from pathlib import Path


PREDICTION_FIELDS = ["specimen_id", "accepted", "first", "second", "third"]
TRUTH_FIELDS = ["specimen_id", "category", "catalog_id"]
MODELS = ["ocr", "mobilenet-v3-small", "dinov2-small", "dinov2-base"]


def compare_rows(rows, threshold):
    correct = wrong = 0
    for row in rows:
        if row["ranked"] and row["confidence"] >= threshold:
            hit = row["ranked"][0]["id"] == row["catalog_id"]
            correct += int(hit)
            wrong += int(not hit)
    return correct, wrong


def calibrate(rows, max_wrong):
    thresholds = sorted({row["confidence"] for row in rows if row["ranked"]}, reverse=True)
    best = (0, 0, math.inf)
    for threshold in thresholds:
        correct, wrong = compare_rows(rows, threshold)
        if 100 * wrong <= max_wrong * len(rows) and (correct, -wrong) > best[:2]:
            best = (correct, -wrong, threshold)
    return best


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--max-wrong-per-100", type=float, default=1.0)
    args = parser.parse_args()
    if not 0 <= args.max_wrong_per_100 <= 100:
        parser.error("--max-wrong-per-100 must be between 0 and 100")
    args.output.mkdir(parents=True, exist_ok=True)
    reports = {}
    identity = None
    catalog_count = None
    hardware = None
    for path in args.reports:
        report = json.loads(path.read_text(encoding="utf-8"))
        name = report["model"]
        if name not in MODELS or name in reports:
            parser.error(f"Unexpected or duplicate model report: {name}")
        if catalog_count is None:
            catalog_count = report["reference_count"]
            hardware = (report["device"], report["os"])
        if report["reference_count"] != catalog_count or (report["device"], report["os"]) != hardware:
            parser.error("Use the same catalog and the same physical hardware/OS for each report")
        rows = report["predictions"]
        keys = sorted(tuple(row[key] for key in TRUTH_FIELDS + ["split"]) for row in rows)
        if identity is None:
            identity = keys
        if keys != identity or len({key[0] for key in keys}) != len(keys):
            parser.error("Reports must use the same distinct physical specimens, categories, splits, and truth")
        reports[name] = report
    if "ocr" not in reports or len(reports) < 2:
        parser.error("Provide the OCR baseline and at least one candidate")

    threshold_report = {}
    calibration_accuracy = {}
    for name, report in reports.items():
        rows = report["predictions"]
        thresholds = {}
        accuracy = {}
        for category in ("coin", "banknote"):
            calibration = [r for r in rows if r["split"] == "calibration" and r["category"] == category]
            test = [r for r in rows if r["split"] == "test" and r["category"] == category]
            if not calibration or not test:
                parser.error(f"Provide both calibration and test specimens for {category}")
            accuracy[category], _, thresholds[category] = calibrate(calibration, args.max_wrong_per_100)
        threshold_report[name] = {key: value if math.isfinite(value) else None for key, value in thresholds.items()}
        calibration_accuracy[name] = accuracy
        predicted = []
        for row in rows:
            if row["split"] != "test":
                continue
            ranked = ([item["id"] for item in row["ranked"]] + ["", "", ""])[:3]
            predicted.append(dict(zip(PREDICTION_FIELDS, [
                row["specimen_id"], int(bool(ranked[0]) and row["confidence"] >= thresholds[row["category"]]), *ranked
            ])))
        write_csv(args.output / (name + ".csv"), PREDICTION_FIELDS, predicted)
    truth = [{key: row[key] for key in TRUTH_FIELDS} for row in reports["ocr"]["predictions"] if row["split"] == "test"]
    write_csv(args.output / "truth.csv", TRUTH_FIELDS, truth)
    scorer = Path(__file__).with_name("numi_benchmark.py")
    comparisons = {}
    for name in MODELS[1:]:
        if name not in reports:
            continue
        report = {"against_ocr": None, "decision_by_category": {}}
        for smaller in MODELS[:MODELS.index(name)]:
            if smaller not in reports:
                continue
            result = subprocess.run([sys.executable, str(scorer), str(args.output / "truth.csv"),
                                     str(args.output / (smaller + ".csv")), str(args.output / (name + ".csv"))],
                                    check=True, capture_output=True, text=True)
            compared = json.loads(result.stdout)
            if smaller == "ocr":
                report["against_ocr"] = compared
            for category in ("coin", "banknote"):
                best = max((m for m in MODELS[:MODELS.index(name)] if m in reports),
                           key=lambda m: calibration_accuracy[m][category])
                if smaller != best:
                    continue
                group = compared["by_category"][category]
                same_wrong = group["baseline"]["confident_wrong_per_100"] == group["candidate"]["confident_wrong_per_100"]
                report["decision_by_category"][category] = {
                    "smaller_model": smaller, "same_confident_wrong_rate": same_wrong,
                    "meets_gain_rule": same_wrong and group["gain_per_100"] >= 5 and group["paired_bootstrap_95pct"][0] > 0,
                    **group,
                }
        comparisons[name] = report
    output = {"calibration_max_wrong_per_100": args.max_wrong_per_100, "thresholds": threshold_report,
              "comparisons": comparisons,
              "device_metrics": {name: {key: value for key, value in report.items() if key != "predictions"}
                                 for name, report in reports.items()}}
    path = args.output / "comparison.json"
    path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
