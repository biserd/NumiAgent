"""Fit one family fallback on earlier coins and score it on the frozen new set."""

import argparse
import itertools
import json
import math
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

from score_possible_matches import Policy, paired_ci, visible


@dataclass(frozen=True)
class FamilyGate:
    strength: float
    group_margin: float
    score_kind: str


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def catalog_maps(catalog):
    labels = {row["id"]: row["issuer"] + " " + row["denomination"] for row in catalog
              if row["type"] == "coin" and row["id"].startswith("ans-")}
    groups = Counter(labels.values())
    return {id: family for id, family in labels.items() if groups[family] >= 2}, {
        row["id"]: row["type"] for row in catalog}


def family_evidence(row, group_by_id):
    ranked = row["ranked"]
    left, right = ranked[:2]
    family = group_by_id.get(left["id"])
    if family is None or group_by_id.get(right["id"]) != family:
        return None
    outsiders = [item for item in ranked[2:] if group_by_id.get(item["id"]) != family]
    if not outsiders:
        return None
    visual = min(left["imageSimilarity"], right["imageSimilarity"])
    return {
        "family": family,
        "strength": visual,
        "combined_gap": right["score"] - max(item["score"] for item in outsiders),
        "visual_gap": visual - max(item["imageSimilarity"] for item in outsiders),
    }


def combine(row, example, exact, evidence, gate):
    truth = example["catalog_id"]
    if exact:
        ids = [item["id"] for item in exact]
        return {"correct": int(bool(truth) and truth in ids), "wrong": sum(id != truth for id in ids),
                "wrong_only": int(truth not in ids), "mode": "exact"}
    if evidence and gate and evidence["strength"] >= gate.strength and evidence[gate.score_kind] >= gate.group_margin:
        correct = evidence["family"] == example["similar_group"]
        return {"correct": int(correct), "wrong": int(not correct), "wrong_only": int(not correct), "mode": "family"}
    return {"correct": 0, "wrong": 0, "wrong_only": 0, "mode": "review"}


def outputs(rows, manifest, catalog, baseline):
    groups, categories = catalog_maps(catalog)
    metadata = {item["specimen_id"]: item for item in manifest["specimens"]}
    for row in rows:
        specimen = metadata[row["specimen_id"]]
        if (row["catalog_id"], row["category"], row["split"]) != (
            specimen["catalog_id"], specimen["category"], specimen["split"]
        ):
            raise ValueError("Prediction labels do not match the frozen manifest")
        if len(row["ranked"]) < 5 or any("imageSimilarity" not in rank for rank in row["ranked"]):
            raise ValueError("The DINOv2-Small report needs at least five ranked scores")
        mode = categories[row["ranked"][0]["id"]]
        exact = visible(baseline[mode], row)
        yield row, specimen, exact, family_evidence(row, groups)


def calculate(entries, gate):
    return [combine(row, specimen, exact, evidence, gate) for row, specimen, exact, evidence in entries]


def summary(results):
    modes = Counter(result["mode"] for result in results)
    return {"n": len(results), "correct": sum(item["correct"] for item in results),
            "wrong_entries": sum(item["wrong"] for item in results), "wrong_only": sum(item["wrong_only"] for item in results),
            "exact_shown": modes["exact"], "families_shown": modes["family"], "needs_review": modes["review"]}


def fit(args):
    training = read(args.report)
    if training["model"] != "dinov2-small":
        raise ValueError("Use the earlier DINOv2-Small report")
    old_outputs = read(args.shortlist_scores)
    baseline_json = {key: pair[0] for key, pair in old_outputs["policies_by_predicted_category"].items()}
    baseline = {key: Policy(**{**data, "floor": math.inf if data["floor"] is None else data["floor"]})
                for key, data in baseline_json.items()}
    manifest = read(args.training_manifest)
    rows = [row for row in training["predictions"] if row["category"] == "coin"]
    entries = list(outputs(rows, manifest, manifest["catalog"], baseline))
    old_results = summary(calculate(entries, None))
    strength = (.75, .80, .84, .87, .89, .91, .93, .95, .97)
    margins = (.005, .015, .025, .040, .055, .075, .10, .13, .17, .22)
    gate, training_summary = None, old_results
    best_key = (old_results["correct"], math.inf, math.inf)
    # Pick the most correct suggestions while preserving every old decision and admitting zero new wrong entries.
    for s, m, kind in itertools.product(strength, margins, ("combined_gap", "visual_gap")):
        proposed = FamilyGate(s, m, kind)
        totals = summary(calculate(entries, proposed))
        key = (totals["correct"], s, m)
        if totals["wrong_entries"] == old_results["wrong_entries"] and key > best_key:
            gate, training_summary = proposed, totals
            best_key = key
    holdout = read(args.holdout_manifest)
    if holdout["catalog"] != manifest["catalog"]:
        raise ValueError("Use the same frozen catalog")
    expected_hashes = read(args.training_source_hashes)
    ref_names = {f"{row['specimen_id']}-{i}.jpg" for row in holdout["specimens"] if row["split"] == "reference"
                 for i in range(1, len(row["photo_sources"]) + 1)}
    sentinel_ids = {row["specimen_id"] for row in holdout["specimens"] if row["split"] == "calibration"}
    sentinels = {row["specimen_id"]: [row["ranked"][0]["id"], row["ranked"][0]["score"]]
                 for row in rows if row["specimen_id"] in sentinel_ids}
    if not sentinel_ids or sentinel_ids != set(sentinels):
        raise ValueError("The replay specimens need initial predictions")
    result = {"model": training["model"], "os": training["os"], "device": training["device"],
              "source_suite": training["suite_sha256"], "references": {key: expected_hashes[key]
                                                                      for key in sorted(ref_names)},
              "sentinels": sentinels, "exact": baseline_json, "family": asdict(gate) if gate else None,
              "training": {"existing": old_results, "with_family": training_summary}}
    write(args.output, result)
    print(json.dumps(result["training"], indent=2))


def evaluate(args):
    report = read(args.report)
    manifest = read(args.holdout_manifest)
    frozen = read(args.policy)
    source_hashes = read(args.source_hashes)
    if any(report[key] != frozen[key] for key in ("model", "os", "device")):
        raise ValueError("Use the same model and Mac runtime for the frozen policy")
    for key, digest in frozen["references"].items():
        if source_hashes.get(key) != digest:
            raise ValueError(f"Reference changed: {key}")
    expected = {row["specimen_id"] for row in manifest["specimens"] if row["split"] == "test"}
    rows = [row for row in report["predictions"] if row["split"] == "test"]
    if len(rows) != len(expected) or {row["specimen_id"] for row in rows} != expected:
        raise ValueError("The report is missing fresh held-out specimens")
    replays = {row["specimen_id"]: row for row in report["predictions"] if row["split"] == "calibration"}
    for id, (leading, score) in frozen["sentinels"].items():
        rank = replays[id]["ranked"][0]
        if rank["id"] != leading or abs(rank["score"] - score) > 0.03:
            raise ValueError(f"Recognition replay drifted: {id}")
    baseline = {key: Policy(**{**data, "floor": math.inf if data["floor"] is None else data["floor"]})
                for key, data in frozen["exact"].items()}
    gate = FamilyGate(**frozen["family"]) if frozen["family"] else None
    entries = list(outputs(rows, manifest, manifest["catalog"], baseline))
    before, after = calculate(entries, None), calculate(entries, gate)
    families = set(catalog_maps(manifest["catalog"])[0].values())
    detail = []
    for ((row, specimen, _, evidence), old, new) in zip(entries, before, after):
        cohort = ("exact_in_catalog" if specimen["catalog_id"] else
                  "family_only" if specimen["similar_group"] in families else "family_out_of_catalog")
        detail.append({"id": row["specimen_id"], "cohort": cohort, "expected_family": specimen["similar_group"],
                       "displayed_family": evidence["family"] if new["mode"] == "family" else None,
                       "old": old, "new": new})
    slices = {}
    for cohort in ("exact_in_catalog", "family_only", "family_out_of_catalog"):
        selected = [row for row in detail if row["cohort"] == cohort]
        slices[cohort] = {"existing": summary([row["old"] for row in selected]),
                          "with_family": summary([row["new"] for row in selected])}
    old, new = summary(before), summary(after)
    report = {"suite_sha256": report["suite_sha256"], "existing": old, "with_family": new,
              "correct_gain": new["correct"] - old["correct"],
              "added_wrong": new["wrong_entries"] - old["wrong_entries"],
              "gain_95pct_ci_per_100": paired_ci(before, after), "by_cohort": slices,
              "meets_goal": new["correct"] > old["correct"] and new["wrong_entries"] == old["wrong_entries"],
              "per_specimen": detail}
    write(args.output, report)
    print(json.dumps({key: value for key, value in report.items() if key != "per_specimen"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="phase", required=True)
    for phase, paths in (
        ("fit", ("report", "training_manifest", "shortlist_scores", "training_source_hashes", "holdout_manifest", "output")),
        ("evaluate", ("report", "source_hashes", "holdout_manifest", "policy", "output")),
    ):
        command = commands.add_parser(phase)
        for path in paths:
            command.add_argument(path, type=Path)
    args = parser.parse_args()
    (fit if args.phase == "fit" else evaluate)(args)


if __name__ == "__main__":
    main()
