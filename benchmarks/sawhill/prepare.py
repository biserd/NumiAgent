from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import argparse
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = "COIN-Research-Group/sawhill-dataset"
REVISION = "af177c884a6949a42b607e2c46d6660f633d754f"
ROOT = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}"
API = f"https://huggingface.co/api/datasets/{REPO}/tree/{REVISION}"


def get(url):
    for attempt in range(4):
        try:
            request = Request(url, headers={"User-Agent": "NumiAgent-Sawhill-Benchmark/1.0"})
            with urlopen(request, timeout=35) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == 3 or getattr(error, "code", None) in (400, 401, 403, 404):
                raise
            time.sleep(2 ** attempt)


def partition(split):
    location = f"processed-stills-{split}"
    listing = json.loads(get(f"{API}/{location}?limit=1000"))
    faces = {}
    for entry in listing:
        if entry["type"] != "directory":
            continue
        match = re.fullmatch(r"(\d+(?:\.\d+)+)-(obv|rev)", entry["path"].rsplit("/", 1)[-1])
        if match:
            faces.setdefault(match[1], {})[match[2]] = entry["path"]
    complete = {key: value for key, value in faces.items() if len(value) == 2}
    ordered = sorted(complete, key=lambda key: sha256(f"numiagent-sawhill-v1:{key}".encode()).hexdigest())
    rows = []
    for index, key in enumerate(ordered):
        views = [complete[key][side] for side in ("obv", "rev")]
        rows.append({
            "id": key,
            "split": "calibration" if split == "train" else "test",
            "query": [f"{view}/direct_color_2.png" for view in views],
            "gallery": [f"{view}/scan_p1_color_large.png" for view in views] if index % 2 == 0 else [],
        })
    return rows, sorted(set(faces) - set(complete))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", type=Path)
    args = parser.parse_args()
    fixture = args.fixture
    with ThreadPoolExecutor(max_workers=2) as executor:
        (calibration, incomplete_calibration), (test, incomplete_test) = executor.map(partition, ("train", "test"))
    assert len(calibration) == 54 and len(test) == 100, "Sawhill side inventory changed"
    assert not {row["id"] for row in calibration} & {row["id"] for row in test}
    rows = calibration + test
    sources = [source for row in rows for source in row["query"] + row["gallery"]]

    def materialize(source):
        target = fixture / source
        if not target.exists():
            contents = get(f"{ROOT}/{source}")
            if not contents.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError(f"Expected PNG bytes at {source}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents)
        return source, sha256(target.read_bytes()).hexdigest()

    with ThreadPoolExecutor(max_workers=12) as executor:
        digests = dict(executor.map(materialize, sources))
    if len(set(digests.values())) != len(sources):
        raise ValueError("Duplicated image bytes in gallery or queries")
    manifest = {
        "revision": REVISION,
        "rows": rows,
        "skipped_incomplete": incomplete_calibration + incomplete_test,
        "sha256": digests,
    }
    (fixture / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Frozen {len(calibration)} calibration and {len(test)} test accessions, {len(sources)} distinct stills.")


if __name__ == "__main__":
    main()
