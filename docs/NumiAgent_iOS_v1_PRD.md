# NumiAgent iOS v1.0 — Product requirements

**Handoff for Codex · 17 November 2026 · Target repository: `biserd/NumiAgent`**

## 1. Release decision

Ship an iPhone-first app for someone with a tray of coins, an album of banknotes, or a backlog of photos. They can photograph several pieces, review the identification, and reopen a searchable collection tomorrow. They can do this without supplying an email. Offer identification to guests and signed-in collectors. Run available on-device checks first and offer an online lookup when the collector wants more help. Keep the existing iPad layout and email-account experience.

**First-session success:** A first-time collector saves three of their own pieces, including one uncertain identification, and can find all three after restarting the app. **Market hypothesis:** Fast batch entry earns the first session. Keeping a collection on the phone gives collectors a reason to enter pieces they previously kept in a spreadsheet or on paper.

## 2. Start from the existing product

The iOS README on `main` documents a SwiftUI iOS/iPadOS 17+ app with email-link authentication, Keychain sessions, photo drafts, batch review, exports, and an **Explore demo** option. The Cloudflare app already serves an authenticated web catalog. Its documented photo workflow can save images to R2 even when AI analysis is skipped. A local collection therefore needs its own persistence path. A demo fixture, a cached account catalog, and the existing **Save without AI** action cannot serve as guest storage.

Implement in the existing project. Inspect the current branch before changing navigation, persistence or networking. Reuse specimen models, image preprocessing, review controls, CSV escaping, and accessibility behavior where compatible. Preserve existing IDs, signed-in sessions and remote records across upgrades.

[Native app and build guide](https://github.com/biserd/NumiAgent/blob/main/ios/README.md) · [Cloudflare data and photo lifecycle](https://github.com/biserd/NumiAgent/blob/main/cloudflare/docs/architecture.md) · [Existing verification](https://github.com/biserd/NumiAgent/blob/main/cloudflare/docs/verification.md)

## 3. Required collector experience

| Screen or event | Required behavior |
| --- | --- |
| **First open** | Primary **Start scanning** enters a real, empty local collection. Secondary **Sign in with email** opens the existing magic-link flow. **Restore backup** is reachable before creating records. Ask for camera permission when the user opens the camera. |
| **Scan or import** | Capture a front and optional back, retake either side, or select photos from the system picker. Let the user adjust front/back pairing before saving. Show the current piece and batch count. Camera denial leaves import and manual entry usable. |
| **Interrupt and resume** | Persist each accepted photo, its piece and side, and each review edit before marking it saved. After force-quit or restart, show **Resume batch** at the unfinished piece. An interrupted write must leave either a valid draft or a clear retry. |
| **Review matches** | Show **Finding matches…**, then the likely match, **Possible matches**, or **Needs review**. Present the observed fields and any reference used. Offer **Search online** for unresolved pieces and **Save for later**. Use the same result and review screens for local and online identification. Keep model names and processing details out of the main flow. The collector can confirm, correct, choose another match or **Save as unidentified**. Keep confirmed fields when retrying recognition. Two physical specimens may share the same catalog reference. |
| **My collection** | Open here on return. Search by name, issuer/country, denomination or year. Filter by coins, banknotes and unidentified pieces. Open both sides, edit fields, or delete a selected piece with confirmation. Never substitute demo records for an empty collection. |
| **Collection menu** | Offer **Back up collection**, **Restore backup** and **Export spreadsheet**. Show the active collection and where it is stored. Expose email sign-in in Settings without interrupting the first batch. |

**Minimum record.** Give each physical piece a stable local ID. Store type, editable title or attribution, optional year, issuer, denomination, notes, confirmation status, and references to its photos. Keep optional serial number and purchase price/currency private by default on export. Permit unknown values. Use the existing data model for additional fields already supported.

## 4. Identification and privacy boundary

**Default local path.** Capture, import, review, edit, save and search must work from a fresh install in airplane mode. Store records and photos in durable app storage with iOS file protection. Retain the two side assignments and image orientation, strip location metadata from app-managed image copies, and avoid saving camera captures to the system photo library automatically. Opening a local collection must not provision a backend guest account, upload images, or send inventory fields to analytics.

**Online identification for guests and accounts.** Reuse the existing identification provider and review workflow. The collector can tap **Search online** for the unresolved pieces they select. Before sending, show the count and explain what leaves the device. Use **Send selected photos** and **Keep on this iPhone** for the confirmation. Show the resulting candidates in the standard review screen. Send only the selected photos with location metadata removed and the request metadata needed for processing. Keep inventory records, notes, purchase details and email outside the recognition payload.

**Guest request lifecycle.** Check which parts of the existing Cloudflare pipeline assume an account. Add a guest job path through the Worker where needed and keep provider credentials server-side. Use short-lived, job-scoped access, request and batch limits, and duplicate-safe retries. Persist guest photos and responses on the device. If processing requires temporary server storage, isolate it from the account catalog, enforce a bounded lifetime for inputs and outputs, and document actual processing and retention before release. Show progress and a recoverable retry on failure. When offline, save the draft immediately and let the collector request AI again after reconnecting. The signed-in workflow continues to disclose account photo storage separately from AI analysis.

**On-device identification.** Run Apple Vision text recognition against captured crops and compare supported visible fields such as year, denomination and issuer text with a small bundled reference index. Use the Vision APIs available on iOS 17. Reuse high-quality local candidates in the main review flow and preserve manual entry for other pieces. Coins with worn legends, fine mint marks, or look-alike varieties may need review or an online search.

**Bundled model selection.** Prioritize demonstrated recognition quality. Compare Vision text plus reference matching, MobileNetV3-Small, and DINOv2-Small. Include DINOv2-Base if it converts and runs acceptably on the target device. Use identical front/back inputs, OCR, catalog coverage and retrieval rules. Precompute reference embeddings per candidate. Keep all photos of the same physical specimen in one split, keep test specimens separate from tuning and reference photos, and include out-of-catalog pieces, worn coins, banknote series and look-alike varieties. Define the catalog type and variant fields being scored before testing. Measure coins and banknotes separately. At a fixed acceptable rate of confident wrong matches, compare correct first suggestions per 100 pieces across all test pieces, top-three accuracy, abstention and corrections. A proposed threshold for accepting extra size is five additional correct first suggestions per 100 pieces over the best smaller candidate, with a paired 95% confidence interval for the gain above zero. Report uncertainty and unsupported categories. Benchmark the converted model using a fresh offline install on the oldest supported iPhone. Measure installed footprint including its reference index, peak memory and per-piece p95 latency during a 20-piece batch. Verify model and reference redistribution rights. Select the smallest candidate meeting the agreed accuracy and device criteria. A larger model remains eligible whenever its improvement justifies the footprint. [DINOv2 model card](https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md) · [Apple Core ML integration](https://developer.apple.com/documentation/coreml/integrating-a-core-ml-model-into-your-app)

**Customer-facing storage copy.** Use **Saved on this iPhone** for local records and the appropriate account label for cloud records. Describe storage separately from processing. Suggested guest copy: “Your collection is saved on this iPhone. If you search online, we send the photos you select to find a match.” Document and test the actual iOS device-backup policy before making a stronger exclusivity claim. Distinguish an Apple device backup, a user-exported file in iCloud Drive, and a NumiAgent account upload.

## 5. Optional email and existing customers

- An existing valid session opens the existing account collection after upgrade. An expired session can be renewed through the existing email link. A separately created local collection remains accessible.
- Guest records belong to the local collection. Signing in opens the account collection and leaves the local copy intact. Offer an explicit way to switch back to **On this iPhone**. Sign-out removes access to the account view and preserves guest records.
- Automatic merging and uploading local holdings on sign-in are outside v1. If an existing transfer action is reused, preview the items, target account and uploaded fields, require explicit confirmation, keep originals and make retries duplicate-safe. Email alone cannot recover a guest collection or decrypt its exported backup.

## 6. Backup and export are separate actions

| Action | Output, destination and failure behavior |
| --- | --- |
| **Back up collection** | Write one versioned, encrypted `.numiagent` file containing the selected local collection, photos, private fields and unfinished batches. Create a consistent snapshot with a manifest, then present the system file exporter. The collector can save in Files, including iCloud Drive if configured, or share a copy to a Mac via AirDrop. Create a collector-held recovery key using a reviewed platform/library implementation. Prompt the user to keep it separately. Exclude session tokens and the raw recovery key from the archive. Mark a backup complete only after the write/export succeeds. |
| **Restore backup** | Choose a file and enter its recovery key. Once the file is available locally, restoration works offline and without email. Validate integrity, version and available space before committing. Preview counts. Restore into a separate local collection when the phone already has data. Retrying the same import must not duplicate pieces. Wrong key, corruption, cancellation or interruption leaves the current collection usable. |
| **Export spreadsheet** | Create a UTF-8 CSV with one row per saved physical piece. Default columns cover type, title, issuer, denomination, year and identification status. Notes, serial number and purchase price/currency require explicit selection. Preview columns and row count. Escape commas, quotes, newlines and spreadsheet formula inputs. Use the system share sheet or Files so the collector can open the file in Numbers, Excel or Google Sheets. The CSV is readable, omits photos and carries no restore guarantee. |

Tell the collector that a backup stored solely on the same phone cannot help if the phone is lost. Explain that losing both the local copy and the recovery key makes the encrypted file unusable. Never log the key or include it in diagnostic exports.

## 7. Release boundaries

**TestFlight beta:** Deliver the complete guest capture, persistent collection and review loop, automatic on-device text recognition and opt-in online identification without email, and optional email access. Validate on a physical iPhone with real, permissioned photos.

**Public v1:** Add verified portable backup/restore and CSV export to that beta. Preserve the existing universal app and web product. Defer new web screens, QR pairing, cross-device encrypted sync, cloud recovery, subscription changes, and new auction-provider or checklist work. Existing account features can remain accessible. Sample auction prices and synthetic identification results belong in the labeled demo only.

## 8. Acceptance tests for Codex

| ID | Reproducible check | Pass condition |
| --- | --- | --- |
| V1-01 | Fresh install, airplane mode, no email. Capture a coin, import a banknote and manually add an unknown piece. | Three real local entries persist. Search and filters retrieve the right entries. The guest workflow issues no backend collection or photo requests, including on reconnect. |
| V1-02 | Capture the front of piece 7, force-quit, reopen, add the back and save. Interrupt and retry an import. | Earlier pieces and photos remain intact. Sides attach to piece 7 exactly once. No relaunch triggers sign-in. |
| V1-03 | Import a mixed batch including similar pieces, a missing reverse, a rotated image and a GPS-tagged photo. Deny camera permission. | Import and manual entry work. Orientation and intentional duplicates survive. Saved image copies contain no GPS metadata. |
| V1-04 | Use permissioned real coin and banknote photos with known fields, worn examples and out-of-scope pieces. | Report correct, incorrect and abstained suggestions separately for each advertised field and category. Confirm and correct both work. Show the proposed launch coverage and real results before marketing recognition accuracy. |
| V1-05 | Upgrade an existing signed-in installation. Separately, create a guest batch, sign into an account, sign out and switch local collections. | Prior account records and sessions remain functional. Guest data stays on-device, account data stays isolated, and neither view silently acquires the other's records. |
| V1-06 | Export an encrypted backup with two-sided photos, private fields and a draft. Restore it on a clean installation in airplane mode. Try a wrong key, a damaged file, cancellation and a repeated restore. | Stable IDs, all field values, photos, side assignments and draft progress round-trip. Repeated restore creates no extra specimens. Failures preserve existing data. |
| V1-07 | Export a CSV with private fields off and then on, including quotes, Unicode, commas and formula-like text. | The spreadsheet opens correctly, reflects the preview, contains one row per saved piece and includes only the fields selected. |
| V1-08 | Run existing iPhone/iPad account tests and smoke-test guest capture on an actual iPhone, including limited storage and recognition failure. | Core navigation, sign-in and account photo review still work. The guest can recover or save manually. Record any physical-device or staging checks that remain pending. |
| V1-09 | In a guest batch, decline online search, then submit only a selected pair. Exercise offline submission, a retry and access to an expired job. | Declining sends no photos. Approved requests work without email, transmit only the selected photos and necessary request metadata, and create no account collection. Results save locally. Retries preserve one job per submission. Expired guest requests and temporary data follow the documented lifecycle. |
| V1-10 | From a fresh install in airplane mode, scan in-scope and out-of-scope photos. Repeat with online lookup enabled and a mixed batch. | Both sources use the same results UI. Local recognition runs without a network connection and flags uncertainty. Only explicitly selected photos leave the phone. Report the local baseline and, if bundling a model, its accuracy, abstention, app-size impact and latency on representative hardware. |

## 9. Learn from the pilot

Recruit 15–20 collectors with a real backlog, including spreadsheet users. Through opt-in feedback or observed sessions, record how many save three pieces, typical time to catalog a 20-piece batch, correction burden, and how many return within 14 days. Ask what they chose to leave out and why. Report counts with denominators. Keep collection contents, photos, serial numbers and private prices out of measurement. Treat the existing synthetic 101-image test as throughput evidence only.

## Codex implementation brief

> Implement the iOS v1 described above in the existing NumiAgent repository. Start by tracing first launch, session restoration, draft photos, identification and exports on the current branch. Map existing behavior to V1-01 through V1-10. Build the local path and on-device Vision first, then connect guest online lookup to the existing provider. Benchmark a bundled Core ML model alongside the baseline. Finish encrypted file backup/restore and CSV. Keep the signed-in web and native clients compatible. Run the relevant suites and report what passed, the real-photo results, and any remaining device or staging checks. The deliverable is working code and verification for the scoped release.
