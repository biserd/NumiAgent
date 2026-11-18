"""Freeze new Roman coins with known family labels and hard out-of-family controls."""

import csv
import gzip
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

from prepare import SOURCE, add


HERE = Path(__file__).parent


def make():
    original = json.loads((HERE / "inputs.json").read_text(encoding="utf-8"))
    shortlist = json.loads((HERE / "confidence-inputs.json").read_text(encoding="utf-8"))
    catalog = shortlist["catalog"]
    roman = {row["source"].replace("https:", "http:", 1): row for row in catalog
             if row["id"].startswith("ans-")}
    families = {row["issuer"] + " " + row["denomination"] for row in roman.values()}
    denominations = {row["denomination"] for row in roman.values()}
    previously_used = original["specimens"] + shortlist["specimens"]
    seen = {row["specimen_id"] for row in previously_used}
    seen_urls = {photo["url"] for row in previously_used for photo in row["photo_sources"] if "url" in photo}
    known = defaultdict(list)
    near = defaultdict(lambda: defaultdict(list))
    hard, other = defaultdict(list), defaultdict(list)
    with gzip.open(SOURCE / "sightings.csv.gz", "rt", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            uri = row["type_uri"]
            id = "ans-" + row["source_url"].rsplit("/", 1)[-1]
            images = ["https://syllogeum.org/images/" + row[key] for key in ("obv_image", "rev_image")
                      if row[key]]
            if (row["attribution"] != "American Numismatic Society" or "/ocre/id/" not in uri
                    or not row["source_url"].startswith(("http://numismatics.org/collection/",
                                                        "https://numismatics.org/collection/"))
                    or not re.fullmatch(r"ans-\d{4}\.\d+\.\d+", id)
                    or not row["authority"] or not row["denomination"] or len(set(images)) != 2
                    or id in seen or any(image in seen_urls for image in images)):
                continue
            seen.add(id)
            seen_urls.update(images)
            family = row["authority"] + " " + row["denomination"]
            record = (row, id, images, family)
            if uri in roman:
                known[uri].append(record)
            elif family in families:
                near[family][uri].append(record)
            else:
                bucket = hard if row["denomination"] in denominations else other
                bucket[uri].append(record)

    rng = random.Random(520184)
    rows = []

    def specimen(record, catalog_id):
        data, id, images, family = record
        add(rows, "coin", id, "test", catalog_id, "historic; wear not graded",
            "Public domain US images, American Numismatic Society; metadata ODbL 1.0 via Syllogeum v1.1",
            data["source_url"].replace("http:", "https:", 1), [{"url": image} for image in images],
            {"issuer": data["authority"], "denomination": data["denomination"]}, group=family)

    for uri, entry in roman.items():
        for record in rng.sample(known[uri], min(5, len(known[uri]))):
            specimen(record, entry["id"])
    for family in sorted(near):
        types = near[family]
        for uri in rng.sample(sorted(types), min(5, len(types))):
            specimen(rng.choice(types[uri]), "")
    for bucket, count in ((hard, 30), (other, 15)):
        for uri in rng.sample(sorted(bucket), count):
            specimen(rng.choice(bucket[uri]), "")

    refs = [row for row in shortlist["specimens"] if row["split"] == "reference"]
    calibration = [row for row in shortlist["specimens"] if row["split"] == "calibration"
                   and row["specimen_id"].startswith("ans-") and row["catalog_id"]]
    sentinels = rng.sample(calibration, 6)
    counts = Counter("exact type" if row["catalog_id"] else "known family" if row["similar_group"] in families
                     else "unseen family" for row in rows)
    print("Fresh coin holdout", dict(counts))
    inputs = {"catalog": catalog, "specimens": refs + sentinels + sorted(rows, key=lambda row: row["specimen_id"])}
    (HERE / "family-inputs.json").write_text(json.dumps(inputs, ensure_ascii=False, indent=2) + "\n",
                                           encoding="utf-8")


if __name__ == "__main__":
    make()
