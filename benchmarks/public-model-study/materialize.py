"""Normalize the same frozen photo inputs for every benchmark configuration."""

import argparse
import json
from pathlib import Path

from download import download_all


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    inputs = json.loads(Path(__file__).with_name("inputs.json").read_text(encoding="utf-8"))
    photos = args.output / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    work, rows = [], []
    for row in inputs["specimens"]:
        sources = row.pop("photo_sources")
        row["photos"] = []
        for side, source in enumerate(sources, start=1):
            target = photos / f"{row['specimen_id']}-{side}.jpg"
            work.append((source, target))
            row["photos"].append("photos/" + target.name)
        rows.append(row)
    print(f"Downloading {len(work)} images for {len(rows)} physical specimens", flush=True)
    hashes = download_all(work)
    if len(hashes) != len(set(hashes)):
        raise ValueError("Duplicate source image bytes in the selected fixture")
    (args.output / "source-sha256.json").write_text(json.dumps(
        {target.name: digest for (_, target), digest in zip(work, hashes)}, indent=2), encoding="utf-8")
    (args.output / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "catalog.json").write_text(json.dumps(inputs["catalog"], ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
