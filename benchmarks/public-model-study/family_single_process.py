"""Keep calibration and holdout disjoint inside one loaded recognition runner."""

import argparse
from pathlib import Path
from types import SimpleNamespace

from score_coin_family import evaluate, fit, read, write


HERE = Path(__file__).parent


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=True)
    prior = read(HERE / "confidence-inputs.json")
    fresh = read(HERE / "family-inputs.json")
    if prior["catalog"] != fresh["catalog"]:
        raise ValueError("The training and test catalogs differ")
    references = [row for row in fresh["specimens"] if row["split"] == "reference"]
    older_coins = [{**row, "split": "calibration"} for row in prior["specimens"]
                   if row["category"] == "coin" and row["split"] != "reference"]
    new_coins = [row for row in fresh["specimens"] if row["split"] == "test"]
    rows = references + older_coins + new_coins
    if len({row["specimen_id"] for row in rows}) != len(rows):
        raise ValueError("The training and test specimens overlap")
    write(directory / "combined-inputs.json", {"catalog": fresh["catalog"], "specimens": rows})
    write(directory / "training-inputs.json", {"catalog": fresh["catalog"], "specimens": references + older_coins})
    print(f"Earlier calibration coins: {len(older_coins)}. New held-out coins: {len(new_coins)}.")


def score(directory, source_hashes, previous_scores):
    fresh = read(HERE / "family-inputs.json")
    combined = read(directory / "combined-dinov2-small.json")
    earlier = [row for row in combined["predictions"] if row["split"] == "calibration"]
    training = directory / "train-report.json"
    replay = {row["specimen_id"] for row in fresh["specimens"] if row["split"] == "calibration"}
    write(training, {**combined, "predictions": earlier})
    policy = directory / "frozen-policy.json"
    fit(SimpleNamespace(report=training, training_manifest=directory / "training-inputs.json",
                        shortlist_scores=previous_scores, training_source_hashes=source_hashes,
                        holdout_manifest=HERE / "family-inputs.json", output=policy))
    holdout = directory / "holdout-report.json"
    write(holdout, {**combined, "predictions": [row for row in combined["predictions"]
                                              if row["split"] == "test" or row["specimen_id"] in replay]})
    evaluate(SimpleNamespace(report=holdout, source_hashes=source_hashes, holdout_manifest=HERE / "family-inputs.json",
                             policy=policy, output=directory / "coin-family-results.json",
                             replay_compatible_runtime=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="phase", required=True)
    commands.add_parser("prepare").add_argument("directory", type=Path)
    scoring = commands.add_parser("score")
    scoring.add_argument("directory", type=Path)
    scoring.add_argument("source_hashes", type=Path)
    scoring.add_argument("previous_scores", type=Path)
    args = parser.parse_args()
    if args.phase == "prepare":
        prepare(args.directory)
    else:
        score(args.directory, args.source_hashes, args.previous_scores)


if __name__ == "__main__":
    main()
