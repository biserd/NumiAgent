# iOS v1 acceptance

The existing signed-in API and Keychain session path remain in use. Local capture uses a separate file-protected directory and makes no catalog or photo request. An existing session can switch to **On this iPhone** in Account. Signing in or out does not transfer either collection.

In the guest Collection menu, **Privacy & browser access** explains the storage and processing choices. **Open web account** requires a separate confirmation and opens the account sign-in page in the browser. The URL carries no guest data or credentials. The photo consent sheet starts with zero selected photos for a new search. A retry can show the photos previously selected for that job and still requires the send action.

Local records, images and draft manifests live in Application Support with complete File Protection. The local root is excluded from ordinary device backup. A collector-created encrypted file can be saved to Files or iCloud Drive. Neither Apple’s device backup nor an email sign-in is a NumiAgent recovery key. An online search sends only the explicitly selected normalized JPEG copies. JPEG re-rendering preserves orientation and removes embedded photo metadata. Guest online input bytes are streamed into bounded Worker memory and are not written to R2 or the account database. The existing vision provider processes the request. The separate D1 job stores a credential hash, image digest, status and result. Access expires 20 minutes after the job timestamp. Hourly maintenance deletes expired rows on its next successful run. Cloudflare’s infrastructure and recovery retention are separate from app access. Usage-limit counters are cleaned by the existing maintenance schedule. The native app persists the selected job and its result locally so a failed request can be retried without creating another collection record.

## Acceptance checks

| ID | Automated coverage | Remaining check |
| --- | --- | --- |
| V1-01 | Guest first-run and save/relaunch through native UI | Physical airplane-mode run with a captured coin, an imported banknote and a manual unknown piece, collection search and filters, and network trace |
| V1-02 | Synthetic front photo persists across app termination, back photo is added to the same draft and one item saves | Physical camera interruption while editing a multi-piece batch |
| V1-03 | JPEG normalization uses the existing orientation-correcting renderer; restore rejects GPS-tagged images | Physical Photos picker with EXIF/GPS fixtures and camera permission denied |
| V1-04 | Shared Vision/catalog matcher and reproducible comparison runner | Real labeled, permissioned photos and field-level reviews |
| V1-05 | Existing phone sign-in and iPad workspace tests; Worker account regressions | Signed existing-account upgrade and local/account round trip on hardware |
| V1-06 | Archive tests cover photos, draft ID, private fields, damage, wrong key and repeat restore | Files and iCloud Drive export/import and interruption on device |
| V1-07 | CSV checks cover escape handling and explicit private-field selection | Open in Numbers or Excel from a device export |
| V1-08 | Existing iPhone and iPad tests plus local API integration | Camera, low-storage recovery and signed-in staging smoke |
| V1-09 | Worker integration covers scoped access, permitted payload, idempotent retry, expiry and account separation. Live staging verified with a real two-sided coin and a single selected side. | Physical selection, cancellation and airplane-mode retry from the native app |
| V1-10 | OCR runs locally and shares the guest review screen with online results | Airplane mode with mixed real pieces, converted model accuracy and device performance |

[Benchmark inputs, conversion and test commands](../ios/benchmark/README.md)

## Staging smoke test

The isolated [staging site](https://staging.numiagent.com/) uses a separate D1 database, R2 bucket, queues and Turnstile widget. It serves the updated marketing and disclosure pages with server-rendered HTML and blocks indexing.

For a device check, run the Xcode Debug scheme with the launch argument `--guest-scan-staging`. This points guest photo searches at staging while leaving the existing account configuration intact. Start scanning as a guest, add both sides, cancel one online consent sheet, then select one side and tap Send selected photos in airplane mode. Reopen the draft after reconnecting and use Retry online search. Switch the argument off for a normal Debug run.

The Workers AI endpoint identified the 1990 U.S. five-cent coin using both unlabelled sides from the [Multi-Camera World Coin Dataset](https://huggingface.co/datasets/irfanhossainsust/multi-camera-world-coin-dataset/tree/3c14042bf841123f65d41733ffa7f28c232e8038), specimen COIN_0256. The staging smoke test simulated a dropped connection before submitting the same job on reconnect. A second test submitted only one photo, discarded the first response and fetched the result again with the same job ID and key. Each completed job recorded one attempt, with zero new accounts, collection records or catalog photos. Empty and extra-field payloads were rejected, foreign origins could not submit, and expired jobs returned 410.

The same endpoint identified the issuer, denomination and year of an [1861 ten-dollar banknote from the National Numismatic Collection](https://commons.wikimedia.org/wiki/File:CSA-T10-$10-1861.jpg) from one photo. These smoke tests cover the live path for each type. They provide two specimen checks, with general accuracy tracked separately by the recognition benchmark.

The current backup implementation holds the encrypted and decoded archive in memory. It caps accepted archives at 128 MiB and caps the saved photo bytes at 64 MiB per export. A larger collection remains usable if it exceeds that export limit.
