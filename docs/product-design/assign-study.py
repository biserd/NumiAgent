"""Generate a reproducible, balanced Figma study assignment sheet locally."""

import argparse
import csv
import random
import sys


def assignments(seed, blocks):
    rng = random.Random(seed)
    for device in ("iPhone", "iPad"):
        for block in range(blocks):
            concepts = list("AABBCC")
            rng.shuffle(concepts)
            for position, concept in enumerate(concepts, start=1):
                yield device, block + 1, block * 6 + position, concept


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--blocks-per-device", required=True, type=int)
    options = parser.parse_args()
    if options.blocks_per_device < 1:
        parser.error("--blocks-per-device must be positive")
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("device", "block", "study_slot", "concept"))
    writer.writerows(assignments(options.seed, options.blocks_per_device))


if __name__ == "__main__":
    main()
