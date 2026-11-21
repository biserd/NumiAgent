# Offline catalog packs

The iOS target packages `ios/NumiAgent/OfflineCatalog` as a resource folder. Photo review and **Search offline catalog** load the same local data. The three packs contain catalog text and source URLs. The app keeps the original six reference entries too.

Run the generator from the repo root with Python 3.12 and the frozen source exports. The script verifies the exact input hashes. The outputs are deterministic.

```powershell
python -B scripts/offline-catalog/generate.py ios/NumiAgent/OfflineCatalog --source PATH_TO_EXPORTS
```

- `types.jsonl.gz` is the [Syllogeum v1.1 type export](https://syllogeum.org/data/files/syllogeum-open-v1.1/types.jsonl.gz). The adapted `AncientCoins.json` is available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) with credit to the American Numismatic Society and Syllogeum.
- `commons-banknotes.json` and `commons-silver-certs.json` are frozen Wikimedia Commons image metadata snapshots from the public specimen study. The generator includes the type facts and source links for public-domain records. The photos are outside the app bundle.
- The modern pack uses issue and series facts from the official sources listed by each entry. It covers selected U.S., Canadian, Hong Kong, and euro issues.

The standalone macOS workflow compiles the same recognition code against the bundled resources. It confirms network denial with a working local control connection. It checks automatic nickel matching, banknote OCR with manual issue lookup, ancient inscription matching, and ambiguous input. The historic note test photo is public domain and credited to the [Smithsonian National Numismatic Collection](https://commons.wikimedia.org/wiki/File:CSA-T35-%245-1861.jpg). The physical iPhone or iPad airplane-mode check requires a device build.

## Expanded catalog

`ExpandedCatalog.sqlite` adds 40,802 OCRE types, 132 U.S. Mint quarter designs and 7,952 Smithsonian banknote records. Search opens the database read-only. Ancient photo matching checks indexed legends across both packs. A U.S. quarter design match requires the design inscription, year and denomination. Smithsonian notes are reference records for manual search.

The [immutable December 2019 OCRE archive](https://github.com/neelsmith/nomisma/blob/b6a6a5141dc998350b8acbf2983322dbca6680d4/cex/ocre-2019-12-04.cex) is verified against its Git blob and deduplicated against the existing Syllogeum type URIs. The OCRE subset of the generated database is distributed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The U.S. Mint issue facts come from published program lists. The Smithsonian import scans the 256 NMAH JSON Lines shards named `00.txt` through `ff.txt` in the [Open Access bucket](https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/index.txt). It requires the National Numismatic Collection and CC0 metadata flags and excludes plate impressions and remainders.

```powershell
python -B scripts/offline-catalog/expand.py ocre-2019-12-04.cex PATH_TO_NMAH_SHARDS `
  ios/NumiAgent/OfflineCatalog scripts/offline-catalog/expansion-sources.json
```

`expansion-sources.json` records the exact source hashes and dataset counts. It also pins the resulting SQLite resource. The Syllogeum experiment is documented in [benchmarks/syllogeum-open](../../benchmarks/syllogeum-open/README.md).
