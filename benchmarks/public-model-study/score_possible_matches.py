"""Fit a conservative shortlist gate on calibration rows and audit a fresh holdout."""

import argparse
import itertools
import json
import math
import random
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ios/benchmark"))
from score_runs import calibrate


CATEGORIES = ("coin", "banknote")
ERRORS = ("wrong_only", "wrong_first", "wrong_candidates", "unknown_shown")
COMBINED_FLOORS = (0, 1.75, 1.85, 1.90, 1.95, 2.2, 2.5, 2.7, 2.8, 2.9)
VISUAL_FLOORS = (0, .70, .78, .83, .88, .91, .93, .95, .97)
MARGINS = (.005, .01, .02, .03, .04, .055, .075, .095, .12, .16, .22, .32)


@dataclass(frozen=True)
class Policy:
    channel: str
    width: int
    floor: float
    margin: float


def visible(policy, row):
    ranked = row["ranked"]
    if policy.channel == "existing":
        return ranked[:policy.width] if row["confidence"] >= policy.floor else []
    scores = []
    for rank in ranked:
        if policy.channel == "combined":
            scores.append(rank["score"])
        elif policy.channel in ("visual", "visual_with_combined_gap"):
            scores.append(rank["imageSimilarity"])
    if len(scores) <= policy.width or scores[0] < policy.floor:
        return []
    if policy.channel == "visual":
        # Compare against every visible competitor outside the shortlist.
        margin = min(scores[:policy.width]) - max(scores[policy.width:])
    else:
        margin = ranked[policy.width - 1]["score"] - ranked[policy.width]["score"]
    return ranked[:policy.width] if margin >= policy.margin else []


def outcome(row, shown):
    truth = row["catalog_id"]
    ids = [rank["id"] for rank in shown]
    return {
        "correct": int(bool(truth) and truth in ids),
        "wrong_only": int(bool(ids) and truth not in ids),
        "wrong_first": int(bool(ids) and ids[0] != truth),
        "wrong_candidates": sum(id != truth for id in ids),
        "unknown_shown": int(not truth and bool(ids)),
        "needs_review": int(not ids),
    }


def summarize(results):
    names = ("correct", *ERRORS, "needs_review")
    totals = {name: sum(result[name] for result in results) for name in names}
    return {"n": len(results), **totals}


def no_extra_errors(proposed, baseline):
    return all(proposed[name] <= baseline[name] for name in ERRORS)


def previous_policy(rows):
    threshold = calibrate(rows, 1)[2]
    return Policy("existing", 3, threshold, 0)


def alternatives(baseline):
    yield baseline
    for channel, floors in (("combined", COMBINED_FLOORS), ("visual", VISUAL_FLOORS),
                            ("visual_with_combined_gap", VISUAL_FLOORS)):
        for width, floor, margin in itertools.product((1, 2, 3), floors, MARGINS):
            yield Policy(channel, width, floor, margin)


def calibrate_policy(calibration, by_id):
    # The app can route using the leading candidate's category. Gold category is used only for audit.
    picked = {}
    for category in CATEGORIES:
        rows = [row for row in calibration if by_id[row["ranked"][0]["id"]] == category]
        baseline = previous_policy(rows)
        counts = {group: summarize([outcome(row, visible(baseline, row)) for row in rows if row["category"] == group])
                  for group in CATEGORIES}
        best, best_key = baseline, None
        for policy in alternatives(baseline):
            results = {group: [] for group in CATEGORIES}
            for row in rows:
                results[row["category"]].append(outcome(row, visible(policy, row)))
            totals = {group: summarize(bucket) for group, bucket in results.items()}
            if not all(no_extra_errors(totals[group], counts[group]) for group in CATEGORIES):
                continue
            key = (sum(total["correct"] for total in totals.values()),
                   -sum(total["wrong_candidates"] for total in totals.values()),
                   -sum(total["wrong_first"] for total in totals.values()),
                   -policy.width)
            if best_key is None or key > best_key:
                best, best_key = policy, key
        picked[category] = (baseline, best)
    return picked


def paired_ci(before, after):
    diffs = [right["correct"] - left["correct"] for left, right in zip(before, after)]
    if not diffs:
        return None
    rng = random.Random(42)
    n = len(diffs)
    draws = sorted(100 * sum(rng.choices(diffs, k=n)) / n for _ in range(2000))
    return [draws[49], draws[1949]]


def summarize_split(rows, picked, by_id):
    output = {}
    for category in CATEGORIES:
        selected = [row for row in rows if row["category"] == category]
        before, after, unguarded = [], [], []
        for row in selected:
            old, new = picked[by_id[row["ranked"][0]["id"]]]
            before.append(outcome(row, visible(old, row)))
            after.append(outcome(row, visible(new, row)))
            unguarded.append(outcome(row, row["ranked"][:3]))
        a, b = summarize(before), summarize(after)
        output[category] = {"existing_gate": a, "proposed_gate": b, "unfiltered_top_three": summarize(unguarded),
                            "correct_gain": b["correct"] - a["correct"],
                            "gain_95pct_ci_per_100": paired_ci(before, after),
                            "no_extra_errors": no_extra_errors(b, a),
                            "meets_goal": b["correct"] > a["correct"] and no_extra_errors(b, a)}
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("predictions", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = json.loads(args.predictions.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if report["model"] != "dinov2-small":
        parser.error("Use the DINOv2-Small report")
    by_id = {entry["id"]: entry["type"] for entry in manifest["catalog"]}
    expected = {row["specimen_id"]: row for row in manifest["specimens"] if row["split"] != "reference"}
    predictions = report["predictions"]
    if len(predictions) != len(expected) or {row["specimen_id"] for row in predictions} != set(expected):
        parser.error("Predictions do not match the frozen study manifest")
    for row in predictions:
        label = expected[row["specimen_id"]]
        if any(row[key] != label[key] for key in ("category", "split", "catalog_id")):
            parser.error("Prediction metadata does not match the frozen manifest")
        if len(row["ranked"]) < 5 or any(rank["id"] not in by_id or "imageSimilarity" not in rank
                                         for rank in row["ranked"]):
            parser.error("Re-run the full rank telemetry with the study CLI")
    calibration = [row for row in predictions if row["split"] == "calibration"]
    test = [row for row in predictions if row["split"] == "test"]
    picked = calibrate_policy(calibration, by_id)

    def export(policy):
        data = asdict(policy)
        if not math.isfinite(data["floor"]):
            data["floor"] = None
        return data

    result = {"suite_sha256": report["suite_sha256"],
              "policies_by_predicted_category": {key: [export(policy) for policy in pair]
                                                   for key, pair in picked.items()},
              "calibration": summarize_split(calibration, picked, by_id),
              "held_out": summarize_split(test, picked, by_id)}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["held_out"], indent=2))


if __name__ == "__main__":
    main()
