"""Export the bundled NumiAgent reference release as a Cloudflare D1 import."""

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'ios' / 'NumiAgent'
PACK = APP / 'OfflineCatalog'
DATASETS = {
    'syllogeum': (21512, 'American Numismatic Society via Syllogeum', 'ODbL-1.0'),
    'ocre': (40802, 'American Numismatic Society and ISAW via Nomisma', 'ODbL-1.0'),
    'us-mint': (132, 'United States Mint', 'US government issue facts'),
    'smithsonian': (7952, 'Smithsonian National Numismatic Collection', 'CC0-1.0'),
    'historic': (58, 'Public-domain records via Wikimedia Commons', 'Public-domain type facts'),
    'modern': (125, 'Issuing authority linked in source', 'Public issue facts'),
    'legacy': (6, 'Issuing authority linked in source', 'Public issue facts'),
}
REPO = 'https://github.com/biserd/NumiAgent/blob/a3a2f3f981e6d8e0803d918dd3ffd31d1dd10d6c/'
FILES = {
    'legacy': APP / 'LocalCatalog.json', 'syllogeum': PACK / 'AncientCoins.json',
    'modern': PACK / 'ModernMoney.json', 'historic': PACK / 'HistoricBanknotes.json',
    'expanded': PACK / 'ExpandedCatalog.sqlite',
}


def entries():
    for dataset in ('legacy', 'syllogeum', 'modern', 'historic'):
        for item in json.loads(FILES[dataset].read_text(encoding='utf-8')):
            details = ' '.join([item.get('searchDetails', ''), item.get('obverseLegend', ''),
                                item.get('reverseLegend', ''), *item.get('issuerWords', []),
                                *item.get('denominationWords', []), *item.get('variantWords', [])])
            yield (*[item[key] for key in ('id', 'type', 'title', 'issuer', 'denomination', 'year', 'source')],
                   dataset, details)

    with sqlite3.connect(FILES['expanded'].as_uri() + '?mode=ro', uri=True) as db:
        for *fields, details in db.execute('''SELECT id,kind,title,issuer,denomination,year,source,search_text
                                              FROM entries ORDER BY id'''):
            dataset = fields[0].split('-', 1)[0]
            yield (*fields, 'us-mint' if dataset == 'usmint' else dataset, details)


def sql(value):
    if isinstance(value, int):
        return str(value)
    if '\0' in value:
        raise ValueError('Catalog text contains NUL')
    return "'" + value.replace("'", "''") + "'"


def write_rows(stream, table, rows):
    for start in range(0, len(rows), 50):
        values = ',\n'.join('(' + ','.join(map(sql, row)) + ')' for row in rows[start:start + 50])
        stream.write(f'INSERT INTO {table} VALUES\n{values};\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    rows = sorted(entries())
    counts = Counter(row[7] for row in rows)
    if counts != {key: data[0] for key, data in DATASETS.items()} or len({row[0] for row in rows}) != len(rows):
        raise ValueError(f'Unexpected catalog counts or duplicate IDs: {dict(counts)}')
    hashes = {key: hashlib.sha256(file.read_bytes()).hexdigest() for key, file in FILES.items()}
    version = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
    sources = {
        key: dict(count=count, attribution=attribution, license=license,
                  download=REPO + FILES.get(key, FILES['expanded']).relative_to(ROOT).as_posix())
        for key, (count, attribution, license) in DATASETS.items()
    }
    with args.output.open('w', encoding='utf-8', newline='\n') as stream:
        schema = ROOT / 'cloudflare' / 'reference-catalog' / 'schema.sql'
        stream.write(schema.read_text(encoding='utf-8'))
        stream.write('DELETE FROM catalog_release;\nDELETE FROM catalog_entries;\n')
        write_rows(stream, 'catalog_entries', [
            (i, *row[:8], *DATASETS[row[7]][1:], row[8]) for i, row in enumerate(rows, start=1)
        ])
        stream.write("INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild');\n")
        write_rows(stream, 'catalog_release', [(1, version, len(rows), json.dumps(sources, sort_keys=True))])
    print(json.dumps({'version': version, 'total': len(rows), 'sources': dict(counts)}, sort_keys=True))


if __name__ == '__main__':
    main()
