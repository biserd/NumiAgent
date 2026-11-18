# iOS v1 acceptance

The existing signed-in API and Keychain session path remain in use. Local capture uses a separate file-protected directory and makes no catalog or photo request. An existing session can switch to **On this iPhone** in Account. Signing in or out does not transfer either collection.

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
| V1-09 | Worker integration covers scoped access, permitted payload, idempotent retry, expiry and account separation | Physical selection, cancellation, offline retry and live provider |
| V1-10 | OCR runs locally and shares the guest review screen with online results | Airplane mode with mixed real pieces, converted model accuracy and device performance |

[Benchmark inputs, conversion and test commands](../ios/benchmark/README.md)

The current backup implementation holds the encrypted and decoded archive in memory. It caps accepted archives at 128 MiB and caps the saved photo bytes at 64 MiB per export. A larger collection remains usable if it exceeds that export limit.
