# NumiAgent recognition benchmark

The shipped baseline is Apple Vision OCR plus the bundled text catalog. No visual encoder or visual reference photos are included in the app binary. The local index currently proposes six issue-level labels covering Jefferson nickels (2006 and 2007), Hong Kong one-dollar coins (1997 and 1998), and Canadian one-dollar notes (1935 and 1937). It does not distinguish die, mint, grade, signatures, or language variants within an issue. Unsupported or ambiguous specimens can be saved as unidentified.

## Fixture input

Prepare a private directory with `catalog.json`, `manifest.json`, and JPEG photos. Copy `ios/NumiAgent/LocalCatalog.json` as the catalog for the launch-coverage test. For expanded coverage, use its schema and freeze one common catalog before any runs. A catalog ID denotes the issue-level type and year unless a separate, observable variant is explicitly defined as its own row. Assign one manifest row to each physical specimen. Store one or two upright images in front/back order per row, prepared at up to 2048 px on the long side, with GPS and personal metadata stripped. Keep all views of each physical specimen in one split, including recrops and images from different sources. Use photos you have permission to process and redistribute if sharing the dataset or embeddings.

```json
[
  {
    "specimen_id": "specimen-001",
    "category": "coin",
    "split": "reference",
    "catalog_id": "us-jefferson-2007-five-cents",
    "condition": "circulated",
    "similar_group": "modern-jefferson",
    "license": "Owner permission. Internal evaluation only.",
    "photos": ["photos/specimen-001-front.jpg", "photos/specimen-001-back.jpg"]
  }
]
```

- Give every catalog ID at least one separate `reference` specimen. The visual encoders compute and cache averaged reference embeddings from this split.
- Include `calibration` and `test` pieces in both `coin` and `banknote`. Include worn coins, similar dates/variants, banknote series, one-sided pieces, and out-of-catalog pieces with an empty `catalog_id`. Aim for hundreds per category and at least 20 test pieces per category. Do not use calibration or test photos in the reference index.
- Keep the exact same manifest, captures, catalog and hardware for all compared runs. Preserve individual images at a fixed orientation and size. The runner rejects identical image bytes across different specimen IDs, but the dataset owner must catch recrops and duplicate physical specimens.
- Run this against actual labeled photos. Synthetic cases can exercise the runner and scorer without measuring recognition accuracy.

## Convert and run

From the repository root on a Mac with Xcode. Python 3.11 is recommended for the converter dependencies.

```sh
SUITE="$PWD/local-benchmark-data"
mkdir -p "$SUITE"
cp ios/NumiAgent/LocalCatalog.json "$SUITE/catalog.json"
# Supply the manifest and photos before running inference.
python3.11 -m venv "$SUITE/.venv"
source "$SUITE/.venv/bin/activate"
python -m pip install -r ios/benchmark/requirements.txt
for model in mobilenet-v3-small dinov2-small dinov2-base; do
  python ios/benchmark/convert_models.py "$SUITE" "$model"
  xcrun coremlcompiler compile "$SUITE/$model.mlpackage" "$SUITE"
done
xcrun swiftc -O ios/NumiAgent/LocalRecognition.swift ios/NumiAgent/RecognitionBenchmark.swift \
  ios/benchmark/Runner.swift -o "$SUITE/recognition-runner"
for model in ocr mobilenet-v3-small dinov2-small dinov2-base; do
  "$SUITE/recognition-runner" "$SUITE" "$model" "$SUITE/$model-report.json"
done
python ios/benchmark/score_runs.py "$SUITE/scored" "$SUITE/"*-report.json --max-wrong-per-100 1
```

If a conversion fails, capture tool versions and the error, and score the available variants without substituting Python inference for on-device results. Core ML uses a 224 px image input, the converted model’s embedding output, and the same preprocessing and similarity scorer for all visual variants. Each specimen uses both selected images as one query. All variants use the same OCR and catalog. Visual variants add cosine similarity to the text scores using a fixed weight. The threshold scorer freezes per-category thresholds on calibration only, writes the requested prediction CSV files, then invokes the supplied `numi_benchmark.py` on identical test rows. For each larger model, the scorer selects the best smaller comparison on calibration. A test category passes the proposed decision rule when its rate of confidently wrong matches equals the smaller model’s rate, gain is at least five correct first suggestions per 100, and the paired 95% interval has a positive lower bound.

## Physical iPhone

Install a Debug build on the oldest supported iPhone available with iOS 17 (for example iPhone XR on iOS 17). Use a fresh app install, keep the screen awake, put the test device in airplane mode after copying inputs, and run each configuration from a fresh process. Use a dedicated benchmark installation because replacing app data can remove the device’s local collection. The signed release excludes the benchmark launch screen.

Put the suite in app Documents as `NumiBenchmark`. Copy only the manifest, catalog, JPEGs and compiled `.mlmodelc` directories. A warm reference index can be produced on-device by the first run, then kept for a separate fresh-process measurement. Run on iPhone from Xcode using launch arguments `--recognition-benchmark ocr` or the same flag and one of the model names in place of `ocr`. The screen displays the report name when done. Download the app container in Xcode’s Devices and Simulators window and retrieve `AppData/Documents/NumiBenchmark/<model>-report.json`. On a command-line pairing, the equivalent workflow is:

```sh
xcrun devicectl device copy to --device "$DEVICE" --source "$DEVICE_SUITE" \
  --destination Documents/NumiBenchmark --domain-type appDataContainer --domain-identifier com.numiagent.ios
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
  com.numiagent.ios --recognition-benchmark mobilenet-v3-small
xcrun devicectl device copy from --device "$DEVICE" --source Documents/NumiBenchmark/mobilenet-v3-small-report.json \
  --destination "$SUITE/iphone-mobilenet-v3-small-report.json" \
  --domain-type appDataContainer --domain-identifier com.numiagent.ios
python ios/benchmark/score_runs.py "$SUITE/iphone-scored" "$SUITE/"iphone-*-report.json --max-wrong-per-100 1
```

Reports include device and OS, compiled model bytes, cached reference index bytes, catalog bytes, peak process resident memory, elapsed time and piece p95 for each complete 20-piece batch. Report the reference setup and fresh-process measurements separately. Use Instruments to corroborate memory on the target phone, and Xcode’s installed-size report to validate the complete signed app footprint before committing to a model. A Windows build host has no Apple Vision/Core ML runtime. Real labeled results, Core ML conversion/execution, device footprint and latency remain pending until the suite is run on the device.

Before shipping any visual encoder or reference images, verify the weight and source image licenses and document the applicable attribution and redistribution terms. The baseline’s catalog contains factual fields and source links rather than bundled reference images.
