"""Offline scoring for NumiAgent model outputs, using Python 3.10+.

Usage: python numi_benchmark.py truth.csv small.csv large.csv
truth.csv columns: specimen_id,category,catalog_id
prediction files: specimen_id,accepted,first,second,third
Use a blank catalog_id for an out-of-catalog specimen. Supply one row per
physical specimen, with both sides processed together. accepted is 0 or 1.
Choose each model's acceptance threshold on separate calibration specimens,
then freeze it before generating these test predictions. This script evaluates
outputs from any runner (including Core ML on iPhone). It does not run inference.
"""
import argparse
import csv
import json
import random
from pathlib import Path


def read_rows(path, required):
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not set(required).issubset(reader.fieldnames or []):
            raise ValueError(f"{path} needs columns {required}")
        rows = {}
        for row in reader:
            key = row["specimen_id"].strip()
            if not key or key in rows:
                raise ValueError(f"Missing or duplicate specimen ID in {path}")
            rows[key] = {field: row[field].strip() for field in required}
    if not rows:
        raise ValueError(f"Empty dataset in {path}")
    return rows


def score(truth, predictions, ids):
    correct, wrong, top_three, known = 0, 0, 0, 0
    hits = []
    for key in ids:
        expected = truth[key]["catalog_id"]
        pred = predictions[key]
        if pred["accepted"] not in {"0", "1"}:
            raise ValueError(f"Invalid acceptance flag for {key}")
        accepted = pred["accepted"] == "1"
        if accepted and not pred["first"]:
            raise ValueError(f"Accepted empty match for {key}")
        hit = int(bool(expected) and accepted and expected == pred["first"])
        hits.append(hit)
        correct += hit
        wrong += int(accepted) - hit
        if expected:
            known += 1
            top_three += int(expected in [pred["first"], pred["second"], pred["third"]])
    count = len(ids)
    return {"n": count, "correct_first_per_100": 100*correct/count,
            "confident_wrong_per_100": 100*wrong/count,
            "abstained": count-correct-wrong, "in_catalog": known,
            "top3_pct_in_catalog": 100*top_three/known if known else None}, hits


def compare(truth, baseline, candidate, ids):
    first, a = score(truth, baseline, ids)
    second, b = score(truth, candidate, ids)
    diffs = [y-x for x, y in zip(a, b)]
    rng = random.Random(42)
    n = len(ids)
    draws = sorted(100*sum(rng.choices(diffs, k=n))/n for _ in range(2000))
    return {"baseline": first, "candidate": second,
            "gain_per_100": 100*sum(diffs)/n,
            "paired_bootstrap_95pct": [draws[49], draws[1949]]}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    for arg in ("truth", "baseline", "candidate"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    truth = read_rows(args.truth, ["specimen_id", "category", "catalog_id"])
    fields = ["specimen_id", "accepted", "first", "second", "third"]
    baseline = read_rows(args.baseline, fields)
    candidate = read_rows(args.candidate, fields)
    if truth.keys() != baseline.keys() or truth.keys() != candidate.keys():
        raise ValueError("All three files must contain exactly the same specimen IDs")
    groups = {}
    for key, row in truth.items():
        groups.setdefault(row["category"], []).append(key)
    print(json.dumps({"overall": compare(truth, baseline, candidate, list(truth)),
                      "by_category": {g: compare(truth, baseline, candidate, ids)
                                      for g, ids in groups.items()}}, indent=2))


if __name__ == "__main__":
    main()
