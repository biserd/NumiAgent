"""Fetch the frozen visual query images and create unlabeled OCR input files."""

import argparse
import hashlib
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def rim_strip(photo, angle):
    # The archive photographs are tightly framed against a light background.
    # Sample an elliptical band to straighten the inscription around the rim.
    data = np.asarray(photo)
    height, width = data.shape
    y, x = np.nonzero(data < 210)
    left, right = (x.min(), x.max()) if len(x) else (0, width-1)
    top, bottom = (y.min(), y.max()) if len(y) else (0, height-1)
    theta = np.linspace(0, 2*np.pi, 1152, endpoint=False) - np.pi/2 + np.pi*(angle >= 180)
    radii = np.linspace(.98, .60, 88)[:, None]
    if angle in (90, 270):
        theta = theta[::-1]
        radii = radii[::-1]
    xs = (left+right)/2 + (right-left)/2 * radii * np.cos(theta)
    ys = (top+bottom)/2 + (bottom-top)/2 * radii * np.sin(theta)
    strip = data[np.rint(ys).astype(int), np.rint(xs).astype(int)]
    return ImageOps.autocontrast(Image.fromarray(strip), cutoff=1)


def prepare(job, directory, originals, unwrap):
    specimen, side, key = job
    if not re.fullmatch(r'[0-9a-f]{16}\.jpg', key):
        raise ValueError(f'Invalid Syllogeum image key: {key}')
    source = originals / key
    if not source.exists():
        temporary = source.with_suffix('.tmp')
        subprocess.run(['curl', '-fsSL', '--retry', '2', '--retry-delay', '1', '--max-time', '30',
                        'https://syllogeum.org/images/' + key, '-o', str(temporary)], check=True)
        temporary.replace(source)
    with Image.open(source) as original:
        photo = ImageOps.autocontrast(ImageOps.exif_transpose(original).convert('L'))
        scale = 768 / max(photo.size)
        photo = photo.resize(tuple(round(edge * scale) for edge in photo.size), Image.Resampling.BICUBIC)
        for angle in (0, 90, 180, 270):
            prepared = rim_strip(photo, angle) if unwrap else photo.rotate(angle, expand=True)
            prepared.save(directory / 'inputs' / f'{specimen}_{side}_{angle}.png')
    return dict(specimen=specimen, side=side, image=key, sha256=hashlib.sha256(source.read_bytes()).hexdigest())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('shortlist', type=Path)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--originals', type=Path)
    parser.add_argument('--unwrap-rim', action='store_true')
    args = parser.parse_args()
    originals = args.originals or args.directory / 'originals'
    originals.mkdir(parents=True, exist_ok=True)
    (args.directory / 'inputs').mkdir(parents=True, exist_ok=True)
    queries = json.loads(args.shortlist.read_text(encoding='utf-8'))['predictions']['two_sides']
    jobs = [(row['specimen_id'], side, row[f'{side}_image']) for row in queries for side in ('obv', 'rev')]
    if len({job[2] for job in jobs}) != len(jobs):
        raise ValueError('Two held-out sides share an exact image key')
    with ThreadPoolExecutor(max_workers=12) as pool:
        manifest = list(pool.map(lambda job: prepare(job, args.directory, originals, args.unwrap_rim), jobs))
    (args.directory / 'photos.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(manifest)} archive photographs and {len(manifest) * 4} orientations')


if __name__ == '__main__':
    main()
