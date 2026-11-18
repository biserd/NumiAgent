# DINOv2-Small Possible matches pilot

The pilot compares two display policies on identical results from the converted DINOv2-Small model and Apple Vision OCR. The comparison used 134 held-out Roman coins and 84 held-out banknotes, including 55 out-of-catalog specimens. The fits use separate calibration specimens. Both policies use the category of the leading candidate at inference time.

| Held-out category | Correct displayed, old → candidate | Wrong first, old → candidate | Wrong-only lists, old → candidate | Incorrect displayed entries, old → candidate |
| --- | ---: | ---: | ---: | ---: |
| Roman coins (134) | 0 → 5 | 0 → 5 | 0 → 5 | 0 → 5 |
| Banknotes (84) | 30 → 32 | 0 → 0 | 0 → 0 | 60 → 0 |

The tested policies both chose a maximum of one displayed suggestion. The coin policy required a strong image match and separation in the combined ranking score. Four wrong suggestions confused two catalog varieties of Probus, and one matched an out-of-catalog coin to a known type. The banknote policy required the leading combined score to be at least 0.16 above the runner-up. It added three correct suggestions and lost one. The paired 95% confidence interval for its net gain was −2.38 to +7.14 correct suggestions per 100.

The banknote results support further testing of a single tentative suggestion with wider series coverage. The coin policy failed the error criterion. An unfiltered top-three list returned the correct type for 79 coins and 65 notes and showed wrong-only lists for 55 coins and 19 notes. The positive banknote set covers cropped views of two Bangladeshi denominations. The held-out coin set covers Roman issues.

## Banknote specimen correction

JaalTaka includes augmented views. The initial public study treated archive IDs as physical specimen IDs, and a manual check confirmed repeats across splits. For example, note 181 was a reference and note 583 was its rotated view in the test split. The shortlist pilot keeps a single capture block, drops the later block and samples holdout IDs separately from all IDs in the original study. The initial banknote scores should be treated as exploratory. [Source paper](https://doi.org/10.1016/j.dib.2025.112378)

## Reproduce the score

Download the `possible-matches-study-results` artifact and use its model report with the frozen manifest in this directory. The workflow compiles a macOS CLI. [Study run and artifacts](https://github.com/biserd/NumiAgent/actions/runs/44300337881)

```sh
python benchmarks/public-model-study/score_possible_matches.py \
  dinov2-small-report.json benchmarks/public-model-study/confidence-inputs.json possible-matches.json
```
