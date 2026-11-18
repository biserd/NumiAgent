"""Create the frozen public dataset manifest before running any inference."""

import csv
import gzip
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path


SOURCE = Path("study-data/source")
OUT = Path(__file__).parent / "inputs.json"
RNG = random.Random(254813)
SPLITS = ("reference", "calibration", "test")
COIN_DATA = "https://huggingface.co/datasets/irfanhossainsust/multi-camera-world-coin-dataset"
COIN_REVISION = "3c14042bf841123f65d41733ffa7f28c232e8038"


def catalog_row(id, category, title, issuer, denom, source, year="", issuer_words=None, denom_words=None,
                variant_words=None):
    return {"id": id, "type": category, "title": title, "issuer": issuer, "denomination": denom, "year": year,
            "source": source, "issuerWords": issuer_words or [issuer],
            "denominationWords": denom_words or [denom], "variantWords": variant_words or []}


def add(specimens, category, id, split, catalog_id, condition, license, url, photos, truth_fields=None, group=None):
    specimens.append({"specimen_id": id, "category": category, "split": split, "catalog_id": catalog_id,
                      "condition": condition, "license": license, "source_url": url,
                      "photo_sources": photos, "truth_fields": truth_fields, "similar_group": group})


def ancient(references, specimens):
    groups = defaultdict(list)
    ids, photos = set(), set()
    with gzip.open(SOURCE / "sightings.csv.gz", "rt", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            url, type_uri = row["source_url"], row["type_uri"]
            accession = url.rsplit("/", 1)[-1]
            frames = [row["obv_image"], row["rev_image"]]
            if (row["attribution"] != "American Numismatic Society" or "/ocre/id/" not in type_uri
                    or not url.startswith(("http://numismatics.org/collection/", "https://numismatics.org/collection/"))
                    or not re.fullmatch(r"\d{4}\.\d+\.\d+", accession)
                    or not all(frames) or accession in ids or any(photo in photos for photo in frames)
                    or not row["authority"] or not row["denomination"]):
                continue
            ids.add(accession)
            photos.update(frames)
            groups[type_uri].append((accession, row, frames))
    with gzip.open(SOURCE / "types.jsonl.gz", "rt", encoding="utf-8") as file:
        types = {row["type_uri"]: row for row in map(json.loads, file)}

    # Include closely related types from the same issuer and denomination.
    families = defaultdict(list)
    for type_uri, rows in groups.items():
        if len(rows) >= 12 and type_uri in types:
            row = rows[0][1]
            families[(row["authority"], row["denomination"])].append(type_uri)
    preferred = [("Tetricus I", "Antoninianus"), ("Victorinus", "Antoninianus"),
                 ("Aurelian", "Antoninianus"), ("Probus", "Antoninianus"),
                 ("Licinius", "AE3"), ("Constantine I", "AE3"),
                 ("Constantius II", "Large AE2"), ("Hadrian", "Denarius"), ("Antoninus Pius", "Denarius")]
    reserved = set()

    def add_coin(record, split, class_id):
        accession, row, images = record
        group = row["authority"] + " " + row["denomination"]
        url = row["source_url"].replace("http:", "https:", 1)
        source_images = [{"url": "https://syllogeum.org/images/" + photo} for photo in images]
        add(specimens, "coin", "ans-" + accession, split, class_id, "historic; wear not graded",
            "Public domain US images, American Numismatic Society; metadata ODbL 1.0 via Syllogeum v1.1",
            url, source_images, group=group)

    for issuer, denom in preferred:
        types_in_family = sorted(families[(issuer, denom)], key=lambda uri: (-len(groups[uri]), uri))
        for uri in types_in_family[:2]:
            info = types[uri]
            id = "ans-" + uri.rsplit("/", 1)[-1]
            legends = [info[key] for key in ("obv_legend", "rev_legend") if info.get(key)]
            label = info.get("type_label", id)
            references.append(catalog_row(id, "coin", label, issuer, denom, uri.replace("http:", "https:", 1),
                                          variant_words=legends))
            sample = RNG.sample(sorted(groups[uri]), 12)
            for split, rows in zip(SPLITS, (sample[:2], sample[2:6], sample[6:])):
                for record in rows:
                    add_coin(record, split, id)
            reserved.add(uri)
    out_of_catalog = sorted(uri for uri in groups if uri not in reserved and len(groups[uri]) >= 5)
    for i, uri in enumerate(RNG.sample(out_of_catalog, 40)):
        add_coin(RNG.choice(groups[uri]), "calibration" if i < 20 else "test", "")


def modern(references, specimens):
    rows_by_coin = defaultdict(list)
    for file in sorted(SOURCE.glob("world-*.csv")):
        split = file.stem.removeprefix("world-")
        with file.open(encoding="utf-8-sig") as rows:
            for row in csv.DictReader(rows):
                row["url"] = f"{COIN_DATA}/resolve/{COIN_REVISION}/data/{split}/{row['file_name']}"
                rows_by_coin[row["coin_id"]].append(row)
    independent = defaultdict(list)
    for coin_id, rows in sorted(rows_by_coin.items()):
        representative = rows[0]
        if representative["coin_type"] in ("", "UNIDENTIFIED"):
            continue
        sides = defaultdict(list)
        for row in rows:
            sides[row["side"]].append(row)
        if sides["obverse"] and sides["reverse"]:
            pair = [min(sides[side], key=lambda row: (row["camera"] == "action-cam", row["image_id"]))
                    for side in ("obverse", "reverse")]
            independent[representative["lookalike_group"] or coin_id].append((representative, pair))
    grouped = defaultdict(list)
    for candidates in independent.values():
        if len({row["coin_type"] for row, _ in candidates}) == 1:
            chosen = min(candidates, key=lambda item: (sum(p["camera"] == "action-cam" for p in item[1]),
                                                      item[0]["coin_id"]))
            grouped[chosen[0]["coin_type"]].append(chosen)

    def add_coin(record, split, class_id):
        row, photos = record
        add(specimens, "coin", "world-" + row["coin_id"], split, class_id, "circulated; wear not graded",
            "CC BY 4.0; Md Irfan Hossain, Multi-Camera World Coin Dataset (2026)", COIN_DATA,
            [{"url": photo["url"]} for photo in photos], group=row["lookalike_group"])

    withheld = []
    for label, rows in sorted(grouped.items()):
        if len(rows) < 3:
            withheld.append(RNG.choice(rows))
            continue
        RNG.shuffle(rows)
        key = "world-" + label.lower()
        row, _ = rows[0]
        denom = row["denomination"] + " " + row["currency"]
        words = [denom, row["denomination"], row["currency"]]
        references.append(catalog_row(key, "coin", row["country"] + " " + denom, row["country"],
                                      denom, COIN_DATA, denom_words=words))
        for position, record in enumerate(rows):
            add_coin(record, SPLITS[min(position, 2)], key)
    RNG.shuffle(withheld)
    for position, record in enumerate(withheld[:20]):
        add_coin(record, "calibration" if position < 10 else "test", "")


def banknotes(references, specimens):
    study = Path("study-data/note-review")
    source_url = "https://data.mendeley.com/datasets/2m7wk5cy4c/2"
    sources = json.loads((study / "sources.json").read_text(encoding="utf-8"))
    labels = json.loads((study / "denominations.json").read_text(encoding="utf-8"))
    if set(labels) != set(sources) or not set(labels.values()) <= {500, 1000, None}:
        raise ValueError("Independently review each source note before creating the manifest")
    for denom, bangla, words in [(500, "৫০০", "five hundred taka"), (1000, "১০০০", "one thousand taka")]:
        title = f"Bangladesh Bank {denom} taka"
        id = f"jaaltaka-bdt-{denom}"
        references.append(catalog_row(id, "banknote", title, "Bangladesh Bank", f"{denom} taka", source_url,
                                      issuer_words=["bangladesh bank", "বাংলাদেশ ব্যাংক"],
                                      denom_words=[str(denom), bangla, words]))
        keys = sorted(n for n, label in labels.items() if label == denom)
        RNG.shuffle(keys)
        for position, key in enumerate(keys):
            split = "reference" if position < 4 else "calibration" if position < 30 else "test"
            add(specimens, "banknote", "jaaltaka-" + key, split, id, "circulated; selected detail views",
                "CC BY 4.0; Chowdhury Piyas et al., JaalTaka v2; genuine banknotes",
                source_url, [sources[key]["1"], sources[key]["5"]], group="bangladesh-modern-portrait")

    photos = json.loads((SOURCE / "commons-banknotes.json").read_text(encoding="utf-8-sig"))["query"]["pages"]
    independent = {}
    for item in sorted(photos.values(), key=lambda item: item["title"]):
        if not item.get("imageinfo"):
            continue
        metadata = item["imageinfo"][0]
        license = metadata["extmetadata"]["LicenseShortName"]["value"]
        match = re.fullmatch(r"File:CSA-T(\d+)-\$(\d+)-(\d{4})(?:–\d{2})?\.jpg", item["title"])
        if (match and license == "Public domain" and metadata.get("thumburl")
                and metadata["height"] / metadata["width"] <= 0.65):
            independent[int(match[1])] = (metadata, match[2], match[3])
    ids = sorted(independent)
    RNG.shuffle(ids)
    for position, type_id in enumerate(ids[:36]):
        meta, denom, year = independent[type_id]
        add(specimens, "banknote", f"nnc-csa-{type_id}", "calibration" if position < 18 else "test", "",
            "historic; wear not graded", "Public domain image; National Numismatic Collection, NMAH, Smithsonian",
            meta["descriptionurl"], [{"url": meta["thumburl"].split("?")[0]}],
            {"issuer": "Confederate States of America", "denomination": f"{denom} dollars", "year": year})


def main():
    references, specimens = [], []
    ancient(references, specimens)
    modern(references, specimens)
    banknotes(references, specimens)
    specimens.sort(key=lambda row: row["specimen_id"])
    if len({s["specimen_id"] for s in specimens}) != len(specimens):
        sys.exit("Duplicate specimen ID")
    OUT.write_text(json.dumps({"catalog": references, "specimens": specimens}, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    for category in ("coin", "banknote"):
        print(category, [(split, sum(r["category"] == category and r["split"] == split for r in specimens))
                         for split in SPLITS])


if __name__ == "__main__":
    main()
