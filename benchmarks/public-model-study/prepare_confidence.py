"""Freeze a new test split with the same catalog and disjoint specimens."""

import csv
import gzip
import json
import random
import re
from collections import defaultdict
from pathlib import Path

from prepare import SOURCE, add


HERE = Path(__file__).parent
RANDOM = random.Random(829734)


def is_primary_note(specimen):
    return int(specimen.removeprefix("jaaltaka-")) <= 400


def coins(target, used, catalog):
    classes = {r["source"].replace("https:", "http:", 1): r["id"]
               for r in catalog if r["id"].startswith("ans-")}
    families = {(r["issuer"], r["denomination"]) for r in catalog if r["id"].startswith("ans-")}
    groups = defaultdict(list)
    near_unknown, other_unknown = defaultdict(list), defaultdict(list)
    used_ids = {r["specimen_id"] for r in used}
    used_images = {p["url"] for r in used for p in r["photo_sources"] if "url" in p}
    with gzip.open(SOURCE / "sightings.csv.gz", "rt", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            accession = row["source_url"].rsplit("/", 1)[-1]
            id = "ans-" + accession
            images = ["https://syllogeum.org/images/" + row[field] for field in ("obv_image", "rev_image")
                      if row[field]]
            if (row["attribution"] != "American Numismatic Society" or "/ocre/id/" not in row["type_uri"]
                    or not row["source_url"].startswith(("https://numismatics.org/collection/",
                                                        "http://numismatics.org/collection/"))
                    or not re.fullmatch(r"\d{4}\.\d+\.\d+", accession) or id in used_ids or len(set(images)) != 2
                    or any(photo in used_images for photo in images)):
                continue
            used_ids.add(id)
            used_images.update(images)
            record = (row, id, images)
            if row["type_uri"] in classes:
                groups[row["type_uri"]].append(record)
            else:
                family = (row["authority"], row["denomination"])
                bucket = near_unknown if family in families else other_unknown
                bucket[row["type_uri"]].append(record)

    def add_coin(record, class_id):
        row, id, images = record
        add(target, "coin", id, "test", class_id, "historic; wear not graded",
            "Public domain US images, American Numismatic Society; metadata ODbL 1.0 via Syllogeum v1.1",
            row["source_url"].replace("http:", "https:", 1),
            [{"url": photo} for photo in images], group=row["authority"] + " " + row["denomination"])

    for type_uri, id in classes.items():
        for record in RANDOM.sample(groups[type_uri], min(6, len(groups[type_uri]))):
            add_coin(record, id)
    for bucket, count in ((near_unknown, 24), (other_unknown, 12)):
        for type_uri in RANDOM.sample(sorted(bucket), count):
            add_coin(RANDOM.choice(bucket[type_uri]), "")


def notes(target, used):
    review = Path("study-data/fresh-note-review")
    sources = json.loads((review / "sources.json").read_text(encoding="utf-8"))
    labels = json.loads((review / "denominations.json").read_text(encoding="utf-8"))
    if set(labels) != set(sources) or not set(labels.values()) <= {500, 1000, None}:
        raise ValueError("Each fresh note needs an independent denomination review")
    for specimen, denom in labels.items():
        if denom and is_primary_note(specimen):
            add(target, "banknote", "jaaltaka-" + specimen, "test", f"jaaltaka-bdt-{denom}",
                "circulated; selected detail views",
                "CC BY 4.0; Chowdhury Piyas et al., JaalTaka v2; genuine banknotes",
                "https://data.mendeley.com/datasets/2m7wk5cy4c/2",
                [sources[specimen]["1"], sources[specimen]["5"]], group="bangladesh-modern-portrait")

    used_ids = {r["specimen_id"] for r in used}
    for collection, pattern, issuer, crop in (
        ("commons-banknotes", r"File:CSA-T(\d+)-\$(\d+)-(\d{4})(?:–\d{2})?\.jpg",
         "Confederate States of America", None),
        ("commons-silver-certs", r"File:US-\$1-SC-(\d{4})(?:-[A-Z])?-Fr[.-](\d+)\.jpg",
         "United States", [0, 0, 1, 0.5]),
    ):
        data = json.loads((SOURCE / (collection + ".json")).read_text(encoding="utf-8-sig"))
        for row in sorted(data["query"]["pages"].values(), key=lambda row: row["title"]):
            match = re.fullmatch(pattern, row["title"])
            if not match or not row.get("imageinfo"):
                continue
            meta = row["imageinfo"][0]
            if meta["extmetadata"]["LicenseShortName"]["value"] != "Public domain" or not meta.get("thumburl"):
                continue
            if crop is None:
                id, denomination, year = "nnc-csa-" + match[1], match[2], match[3]
                if meta["height"] / meta["width"] > 0.65:
                    continue
            else:
                id, denomination, year = "nnc-silver-" + match[2], "1", match[1]
                if not 0.80 <= meta["height"] / meta["width"] <= 0.95:
                    continue
            if id in used_ids:
                continue
            used_ids.add(id)
            image = {"url": meta["thumburl"].split("?")[0]}
            if crop:
                image["crop"] = crop
            add(target, "banknote", id, "test", "", "historic; wear not graded",
                "Public domain image; National Numismatic Collection, NMAH, Smithsonian",
                meta["descriptionurl"], [image],
                {"issuer": issuer, "denomination": denomination + " dollars", "year": year})


def main():
    dataset = json.loads((HERE / "inputs.json").read_text(encoding="utf-8"))
    original = dataset["specimens"]
    target = []
    coins(target, original, dataset["catalog"])
    notes(target, original)
    if len({row["specimen_id"] for row in original + target}) != len(original) + len(target):
        raise ValueError("Study specimens overlap")
    known = {row["id"] for row in dataset["catalog"]}
    if any(row["catalog_id"] and row["catalog_id"] not in known for row in target):
        raise ValueError("A test label does not have a catalog reference")
    for category in ("coin", "banknote"):
        rows = [row for row in target if row["category"] == category]
        print(category, len(rows), "including", sum(not row["catalog_id"] for row in rows), "out of catalog")
    calibration = []
    for row in original:
        if row["specimen_id"].startswith("jaaltaka-"):
            # The archive includes transformed views of the same serials under later IDs.
            # Keep one capture block and reuse its former held-out notes only for calibration.
            if is_primary_note(row["specimen_id"]):
                calibration.append({**row, "split": "reference" if row["split"] == "reference" else "calibration"})
        elif row["split"] != "test":
            calibration.append(row)
    dataset["specimens"] = calibration + sorted(target, key=lambda row: row["specimen_id"])
    (HERE / "confidence-inputs.json").write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n",
                                               encoding="utf-8")


if __name__ == "__main__":
    main()
