"""Sample genuine notes by deposited specimen ID for independent label review."""

import argparse
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

from download import archive_index, download_all


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fresh", action="store_true", help="Exclude the original study specimens")
    args = parser.parse_args()
    initial = Path("study-data/note-review")
    out = initial.with_name("fresh-note-review") if args.fresh else initial
    out.mkdir(parents=True, exist_ok=True)
    index = archive_index()
    if args.fresh:
        previous = set(map(int, json.loads((initial / "sources.json").read_text(encoding="utf-8"))))
        choices = sorted(set(range(1, 803)) - previous)
        sample = sorted(random.Random(72661).sample(choices, 126))
    else:
        sample = sorted(random.Random(17411).sample(range(1, 803), 168))
    sources = {f"{n:03d}": {str(view): {"entry": index[f"real_notes/note_{n:03d}/note_{n:03d}_{view}.jpg"]}
                            for view in (1, 5)} for n in sample}
    work = [(views["5"], out / (key + ".jpg")) for key, views in sources.items()]
    for key, sha in zip(sources, download_all(work)):
        sources[key]["5"]["sha256"] = sha
    (out / "sources.json").write_text(json.dumps(sources, indent=2), encoding="utf-8")

    for start in range(0, len(sample), 42):
        panel = Image.new("RGB", (7 * 156, 6 * 128), "white")
        draw = ImageDraw.Draw(panel)
        for i, n in enumerate(sample[start:start + 42]):
            image = Image.open(out / f"{n:03d}.jpg")
            image.thumbnail((150, 108))
            x, y = (i % 7) * 156, (i // 7) * 128
            panel.paste(image, (x, y))
            draw.text((x, y + 110), f"{n:03d}", fill="black")
        panel.save(out / f"sheet-{start // 42 + 1}.jpg", quality=92)


if __name__ == "__main__":
    main()
