"""Rerank the two-sided shortlist with OCR evidence from the bundled catalog."""

import argparse
import json
import re
import sqlite3
import unicodedata
from pathlib import Path

import numpy as np

from evaluate import canonical, cutoff, score


def letters(value):
    value = unicodedata.normalize('NFKD', value.upper()).translate(str.maketrans('UJ', 'VI'))
    return ''.join(char for char in value if char.isalpha())


def catalog(path):
    entries = []
    for row in json.loads((path / 'AncientCoins.json').read_text(encoding='utf-8')):
        entries.append((row['source'], row.get('obverseLegend', ''), row.get('reverseLegend', '')))
    with sqlite3.connect((path.resolve() / 'ExpandedCatalog.sqlite').as_uri() + '?mode=ro', uri=True) as db:
        entries.extend(db.execute("SELECT source,obverse_key,reverse_key FROM entries WHERE kind='coin'"))
    return {canonical(url): (letters(front), letters(back)) for url, front, back in entries}


def anchors(orientations):
    observed = set()
    for lines in orientations.values():
        for line in lines:
            words = [letters(word) for word in re.findall(r'[^\W\d_]+', line)]
            observed.update(word for word in words if 5 <= len(word) <= 24)
            observed.update(a + b for a, b in zip(words, words[1:]) if min(len(a), len(b)) >= 2 and 6 <= len(a+b) <= 24)
    return observed


def rerank(row, recognized, references):
    candidates = row['ranked']
    legends = [references.get(candidate['type'], ('', '')) for candidate in candidates]
    sides = [anchors(recognized[side]) for side in ('obv', 'rev')]
    # Shared imperial formulas offer little discrimination within a shortlist.
    weights = []
    for anchors_on_side in sides:
        counts = {term: sum(any(term in legend for legend in pair) for pair in legends) for term in anchors_on_side}
        weights.append({term: min(len(term), 12) / 12 for term, count in counts.items() if 0 < count <= len(legends) / 2})

    def strength(observed, legend):
        return max((weight for term, weight in observed.items() if term in legend), default=0)

    updated = []
    for candidate, (obverse, reverse) in zip(candidates, legends):
        direct = strength(weights[0], obverse) + strength(weights[1], reverse)
        swapped = strength(weights[0], reverse) + strength(weights[1], obverse)
        bonus = 0.025 * max(direct, swapped)
        updated.append({**candidate, 'similarity': candidate['similarity'] + bonus, 'ocr_bonus': bonus})
    ranked = sorted(updated, key=lambda candidate: -candidate['similarity'])
    return {**row, 'ranked': ranked, 'has_ocr_anchors': any(sides),
            'has_ocr_text':any(lines for orientations in recognized.values() for lines in orientations.values()),
            'has_catalog_evidence': any(candidate['ocr_bonus'] for candidate in updated)}


def paired(base, fused):
    if not base:
        return {'gained_first':0, 'lost_first':0, 'first_gain_per_100_ci95':None}
    diff = np.array([int(after['ranked'][0]['type'] == after['type']) - int(before['ranked'][0]['type'] == before['type'])
                     for before, after in zip(base, fused)], dtype=np.int8)
    rng = np.random.default_rng(20261121)
    bootstrap = rng.choice(diff, size=(10000, len(diff))).mean(axis=1) * 100
    return {'gained_first':int((diff == 1).sum()), 'lost_first':int((diff == -1).sum()),
            'first_gain_per_100_ci95':np.quantile(bootstrap, [0.025, 0.975]).round(2).tolist()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['shortlist', 'ocr', 'catalog', 'output']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    retrieval = json.loads(args.shortlist.read_text(encoding='utf-8'))
    ocr = json.loads(args.ocr.read_text(encoding='utf-8'))
    base = retrieval['predictions']['two_sides']
    if any(len(row['ranked']) != 20 for row in base):
        raise ValueError('Use a 20-type shortlist from evaluate.py')
    if (set(ocr['specimens']) != {row['specimen_id'] for row in base} or ocr['inputs'] != len(base) * 8 or
        any(set(sides) != {'obv','rev'} or any(set(angles) != {'0','90','180','270'} for angles in sides.values())
            for sides in ocr['specimens'].values())):
        raise ValueError('OCR inputs do not cover all held-out photos and orientations')
    references = catalog(args.catalog)
    fused = [rerank(row, ocr['specimens'][row['specimen_id']], references) for row in base]
    thresholds = [cutoff([row for row in rows if row['split'] == 'calibration']) for rows in (base, fused)]
    groups = {'calibration':lambda row: row['split'] == 'calibration', 'test':lambda row: row['split'] == 'test',
              'worn':lambda row: row['split'] == 'test' and row['worn'],
              'lookalikes':lambda row: row['split'] == 'test' and row['lookalikes'],
              'outside_gallery':lambda row: row['split'] == 'test' and not row['in_gallery']}
    output = {'engine':ocr['engine'], 'ocr_inputs':ocr['inputs'], 'shortlist_size':20,
              'gallery_accessions':retrieval['gallery_accessions'], 'catalog_coin_references':len(references),
              'cutoffs':dict(zip(['visual','fused'], thresholds)), 'groups':{}}
    for name, includes in groups.items():
        visual, hybrid = [[row for row in method if includes(row)] for method in (base, fused)]
        output['groups'][name] = {'visual':score(visual, thresholds[0]), 'fused':score(hybrid, thresholds[1]),
                                  'ocr_text_pieces':sum(row['has_ocr_text'] for row in hybrid),
                                  'ocr_anchor_pieces':sum(row['has_ocr_anchors'] for row in hybrid),
                                  'catalog_evidence_pieces':sum(row['has_catalog_evidence'] for row in hybrid),
                                  'correct_in_full_shortlist':sum(any(candidate['type'] == row['type'] for candidate in row['ranked']) for row in visual),
                                  **paired(visual, hybrid)}
    args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps(output, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
