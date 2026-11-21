# Syllogeum visual retrieval

The benchmark checks the published DINOv2 obverse and reverse vectors from [Syllogeum v1.1](https://syllogeum.org/data/files/syllogeum-open-v1.1/manifest.json). It searches the ANS subset with known catalog types and numeric collection accessions. Every calibration and test accession and every exact image key associated with them is excluded from the reference gallery. Gallery duplicates are removed by accession and image key. Same physical coins with distinct institutional identities or recropped images cannot be ruled out by this check.

The visibly worn cohort was selected from the public photos before running the ranking. The labels record visible relief loss and incomplete peripheral detail, without assigning numismatic grades. The look-alike cohort contains types with a different indexed type from the same authority, denomination and mint. All 122 test coins with a type present in the gallery met that proxy for a look-alike.

The evaluator compares an obverse query against either indexed side and compares two sides in their best alignment. Each type receives the best similarity over its remaining reference specimens. The confidence score adds the winning type’s lead over the runner-up to its similarity. The calibration rule accepts the most correct suggestions while observing zero incorrect suggestions on the separate calibration set.

```sh
python -m pip install numpy==2.5.4
python benchmarks/syllogeum-open/evaluate.py VECTORS_DIR sightings.csv.gz \
  benchmarks/syllogeum-open/queries.json benchmarks/syllogeum-open/wear-labels.json results.json
```

The test used 66,640 distinct reference accessions, 226 calibration coins and 165 test coins. The full report contains ranked type IDs per query. This measures retrieval from released archive vectors. Photo preprocessing and running the query encoder on an iPhone or iPad require a separate test.
