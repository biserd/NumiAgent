"""Measure Syllogeum v1.1 DINOv2 retrieval with physical accessions held out."""

import argparse
import csv
import gzip
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

import numpy as np


CHECKSUMS = {
    "sightings.csv.gz": "13afd9eecd4a255915f34d37482f29185ffd575f1f2e777d041c2fb71f3cab3a",
    "embeddings_dino_obv.npz": "3a76b08d5239be24f088543531d61e945988c2978daa44e275dcb1a2c2061055",
    "embeddings_dino_rev.npz": "cb11eed7ba5a0c49757773622094b944c96811847ffbba2d5632275622a87802",
}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canonical(uri):
    parts = urlsplit(uri)
    return parts.netloc.casefold() + unquote(parts.path).rstrip("/")


def accession(uri):
    match = re.fullmatch(r"numismatics\.org/collection/(\d{4}\.\d+\.\d+)", canonical(uri))
    return match.group(1) if match else None


def sighting_records(source):
    grouped = defaultdict(list)
    indexed = {}
    with gzip.open(source, "rt", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            number = accession(row["source_url"])
            if row["attribution"] != "American Numismatic Society" or not number or not row["type_uri"]:
                continue
            if not row["obv_image"] or not row["rev_image"]:
                continue
            row["accession"] = number
            row["type"] = canonical(row["type_uri"])
            grouped[number].append(row)
            indexed[int(row["id"])] = row
    return indexed, grouped


def query_manifest(path, grouped, available):
    items = json.loads(path.read_text(encoding="utf-8"))
    if len({row["specimen_id"] for row in items}) != len(items):
        raise ValueError("Manifest specimen IDs are not unique")
    queries, missing = [], []
    for item in items:
        if item["split"] not in ("calibration", "test"):
            continue
        number = accession(item["source_url"])
        variants = grouped.get(number, [])
        usable = [row for row in variants if int(row["id"]) in available]
        if len({row["type"] for row in variants}) != 1 or not usable:
            missing.append(item["specimen_id"])
            continue
        chosen = min(usable, key=lambda row: int(row["id"]))
        queries.append({"specimen_id": item["specimen_id"], "split": item["split"], **chosen})
    if len({row["accession"] for row in queries}) != len(queries):
        raise ValueError("An accession was repeated between query rows")
    if {row["split"] for row in queries} != {"calibration", "test"}:
        raise ValueError("Calibration and test splits are both required")
    return queries, missing


def gallery_records(indexed, available, queries, grouped):
    held_out = {row["accession"] for row in queries}
    held_images = {row[side] for number in held_out for row in grouped[number] for side in ("obv_image", "rev_image")}
    seen_accessions, seen_images = set(), set()
    gallery = []
    for id in sorted(indexed):
        row = indexed[id]
        images = {row["obv_image"], row["rev_image"]}
        if (id not in available or row["accession"] in held_out or row["accession"] in seen_accessions
                or images & held_images or images & seen_images):
            continue
        gallery.append(row)
        seen_accessions.add(row["accession"])
        seen_images.update(images)
    return gallery


def rank_types(scores, type_index, types):
    strongest = np.full(len(types), -np.inf, dtype=np.float32)
    np.maximum.at(strongest, type_index, scores)
    best = np.argsort(-strongest, kind="stable")[:3]
    return [{"type": types[i], "similarity": float(strongest[i])} for i in best if np.isfinite(strongest[i])]


def confidence(row):
    first, second, _ = row["ranked"]
    return 2 * first["similarity"] - second["similarity"]


def cutoff(rows):
    wrong = [confidence(row) for row in rows if row["ranked"][0]["type"] != row["type"]]
    max_wrong = max(wrong, default=-math.inf)
    correct = [confidence(row) for row in rows if row["ranked"][0]["type"] == row["type"]]
    return min((score for score in correct if score > max_wrong), default=None)


def family(row):
    return tuple(row[field].casefold().strip() for field in ("authority", "denomination", "mint"))


def score(rows, threshold):
    counts = Counter(total=len(rows))
    for row in rows:
        gold = row["type"]
        best = row["ranked"][0]["type"]
        counts["reference_available"] += row["in_gallery"]
        counts["first_correct"] += best == gold
        counts["among_top_three"] += any(item["type"] == gold for item in row["ranked"])
        if threshold is None or confidence(row) < threshold:
            counts["review"] += 1
        elif best == gold:
            counts["accepted_correct"] += 1
        else:
            counts["accepted_wrong"] += 1
    return {**dict.fromkeys(["reference_available", "first_correct", "among_top_three", "review",
                             "accepted_correct", "accepted_wrong"], 0), **counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vectors", type=Path)
    parser.add_argument("sightings", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("wear_labels", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    for name, expected in CHECKSUMS.items():
        file = args.sightings if name == "sightings.csv.gz" else args.vectors / name
        if digest(file) != expected:
            raise ValueError(f"Unexpected Syllogeum v1.1 file: {name}")
    with np.load(args.vectors / "embeddings_dino_obv.npz", allow_pickle=False) as z:
        obv_ids, obverse = z["ids"], z["vectors"]
    with np.load(args.vectors / "embeddings_dino_rev.npz", allow_pickle=False) as z:
        rev_ids, reverse = z["ids"], z["vectors"]
    if (obverse.shape != (118716, 768) or reverse.shape != obverse.shape
            or len(set(obv_ids)) != len(obv_ids) or set(obv_ids) != set(rev_ids)
            or not np.isfinite(obverse).all() or not np.isfinite(reverse).all()):
        raise ValueError("Invalid released DINOv2 vectors")
    obv_at = {int(id): i for i, id in enumerate(obv_ids)}
    rev_at = {int(id): i for i, id in enumerate(rev_ids)}
    indexed, grouped = sighting_records(args.sightings)
    queries, missing = query_manifest(args.manifest, grouped, obv_at)
    gallery = gallery_records(indexed, obv_at, queries, grouped)
    if min(len(gallery), len(queries)) < 3:
        raise ValueError("Too few accession-verified records")
    worn = set(json.loads(args.wear_labels.read_text(encoding="utf-8"))["worn"])
    if not worn.issubset({row["specimen_id"] for row in queries + [dict(specimen_id=id) for id in missing]}):
        raise ValueError("Wear labels do not match the frozen manifest")

    types = sorted({row["type"] for row in gallery})
    type_at = {value: i for i, value in enumerate(types)}
    type_index = np.array([type_at[row["type"]] for row in gallery])
    families = defaultdict(set)
    for row in gallery:
        families[family(row)].add(row["type"])
    first = obverse[[obv_at[int(row["id"])] for row in gallery]]
    second = reverse[[rev_at[int(row["id"])] for row in gallery]]
    evaluations = {"one_side": [], "two_sides": []}
    print(f"Searching {len(gallery):,} distinct ANS accessions against {len(queries)} held-out query specimens", flush=True)
    for start in range(0, len(queries), 12):
        batch = queries[start:start+12]
        q1 = obverse[[obv_at[int(row["id"])] for row in batch]]
        q2 = reverse[[rev_at[int(row["id"])] for row in batch]]
        aa, ab = q1 @ first.T, q1 @ second.T
        ba, bb = q2 @ first.T, q2 @ second.T
        single = np.maximum(aa, ab)
        paired = np.maximum(aa + bb, ab + ba) * 0.5
        for i, row in enumerate(batch):
            metadata = {key: row[key] for key in ("specimen_id", "split", "type", "source_url", "authority", "denomination", "mint")}
            key = family(row)
            metadata.update({"in_gallery": row["type"] in type_at,
                             "worn": row["specimen_id"] in worn,
                             "lookalikes": all(key) and row["type"] in families[key] and len(families[key]) >= 2})
            for name, matrix in (("one_side", single), ("two_sides", paired)):
                evaluations[name].append({**metadata, "ranked": rank_types(matrix[i], type_index, types)})

    output = {"dataset": "syllogeum-open-v1.1", "gallery_accessions": len(gallery), "gallery_types": len(types),
              "missing_queries": missing, "methods": {}, "predictions": evaluations}
    for name, rows in evaluations.items():
        calibration = [row for row in rows if row["split"] == "calibration"]
        test = [row for row in rows if row["split"] == "test"]
        threshold = cutoff(calibration)
        output["methods"][name] = {"cutoff": threshold, "calibration": score(calibration, threshold),
            "test": score(test, threshold),
            "worn": score([row for row in test if row["worn"]], threshold),
            "lookalikes": score([row for row in test if row["lookalikes"]], threshold)}
    args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(output["methods"], indent=2), flush=True)


if __name__ == "__main__":
    main()
