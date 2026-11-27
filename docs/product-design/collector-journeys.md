# Collector journeys and first value

Reviewed against internal build 30.2 at `77db264`. The App Store listing showed a free app. The native target has email auction-watch subscriptions and no StoreKit products, purchase screen or paid tier. The sale-digest study is a proposed new service. It has no active entitlement. [App Store listing](https://apps.apple.com/us/app/numiagent-coin-scanner/id6835208218) · [Baseline simulator checks](https://github.com/biserd/NumiAgent/actions/runs/45939484999) · [Implementation PR](https://github.com/biserd/NumiAgent/pull/31)

## What changed for collectors

The welcome photograph now opens the Octavian denarius record, including its real image, issuer, date and museum reference. A collector can inspect it offline before granting permission or creating a collection. The large Start scanning button goes directly to the native camera when available. Permission is requested at that moment. Closing the camera leaves the import and manual routes in reach.

Returning collectors see Continue scanning when a draft exists. Explicitly starting another piece creates a separate draft. Collection settings hold account and file actions. Email sign-in still opens the existing account flow. The device collection stays local. On wider welcome windows the specimen and scan action sit side by side. Compact and accessibility layouts keep the primary action at the bottom. On iPad the collection sidebar retains a resume action while the detail pane can show a different record. Narrow windows use the compact navigation.

## Interaction counts

Counts are a walkthrough of the implemented screens, not behavioral analytics. Each cell is **taps / newly presented surfaces / task decisions**, starting on the named screen. A surface is an app view, modal, menu or system sheet. Inline field updates, success messages and model work do not add screens. A decision means choosing data, scope, permission or a course of action. A mechanical Done or Use Photo counts as a tap. Counts exclude scrolling, typing characters, biometric and keyboard interactions. Conditional steps are named. Exact counts depend on where the journey starts, system version and provider results.

| Task and start | Build 30.2 | Revised | Why the remaining interaction exists |
| --- | --- | --- | --- |
| First visit → inspect a sample | 3 / 3 / 2 | **1 / 1 / 1** | Before, open sign-in, explore the demo, choose a specimen. Now tap the welcome photo. The real 29–27 BCE specimen and museum reference are immediately visible. |
| First visit → first accepted camera photo, camera already permitted | 4 / 2 / 2 | **3 / 2 / 2** | Start scanning, press shutter, accept image. One further permission decision on first camera use. Local reading starts after acceptance. Retake remains possible. Hardware timing pending. |
| Open editor → import an existing photo and read locally | 2–3 / 1 / 1 | 2–3 / 1 / 1 | Import, select image, confirm if the system picker requires it. No account, side selector or processing confirmation. On a phone with a camera, an import-first user coming through Start scanning may need to cancel the camera. |
| Local result → save a tentative identification | 1 / 0 / 1 | 1 / 0 / 1 | Review the automatically populated record and save. Ambiguous results retain their review status. Choosing an alternative adds a tap. |
| Local result → online recognition | 1 / 0 / 1 | 1 / 0 / 1 | Inline disclosure identifies the photos and recipient before the button sends them. Offline failure leaves the local draft intact. Retry is one deliberate tap when connectivity returns. |
| Collection → return to active draft | 1 / 1 / 1 | **1 / 1 / 1** | More than one control formerly reached the same record. A single compact primary action now names the outcome. Other drafts are under Scan. |
| Collection with active draft → different empty draft | Same Add route reopened the active piece | **2 / 2 / 1** | Add item → Start a new piece. The earlier draft remains available. Batch import remains a separate action for multiple pieces. |
| Collection → open a saved record, then zoom | 2 / 2 / 2 | 2 / 2 / 2 | Select piece, then photo. Pinch operates on the open image. iPad selection updates the existing detail pane, so it presents only one new surface. |
| Collection → filter to banknotes → inspect one | 3 / 2 / 2 | 3 / 2 / 2 | Open filter, choose banknotes, open a record. When the result list is already visible, search can narrow it directly. |
| Saved record → correct an editable field | 2 / 0 / 1 plus field selection | Same | Edit record, choose and change the field, Done editing. A recognized piece retains its coin or banknote kind. |
| Saved guest record → completed sale lookup | 2 / 1 / 1 | 2 / 1 / 1 | Find comparable sales → Check Numista auction sales. The second action sends catalog hints and spends quota. Ambiguous type or issue adds one choice per level. The photo stays local. |
| Signed-in issue → available price by grade | 0 / 0 / 0 when resolved | Same | The issue guide can load automatically for a known issue. If a type or issue is ambiguous, choose the matching catalog entry. A guide value and a realized sale have separate labels. |
| Signed-in checklist → research a specific gap | 2 / 2 / 2 from checklist index | Same | Open checklist, open its gap auction research. Scheduled watches require no manual refresh. Email opt-in is one further decision on the watch screen when available. |
| Saved record → system share sheet | 2 / 2 / 1 | 2 / 2 / 1 | Ask for a second opinion → Share card. Selecting a recipient is an additional system decision. The collector previews what they are sharing. |
| Welcome → email sign-in form | 1 / 1 / 1 | 2 / 2 / 1 | Occasional account and restore actions share a named menu. Returning signed-in users keep the account workspace. Sending the email and opening the link still require mailbox access. |
| Collection → CSV to Files, default fields | 4 / 2 / 2 via Settings | Same | Settings, Export spreadsheet, Save CSV file, confirm destination. Each optional private field is an explicit additional choice. |
| From Settings → encrypted backup in Files | 5 / 2 / 3 | Same | Back up, create file, acknowledge saved recovery key, save file, select destination. Key storage prevents an unrecoverable backup. |
| From Settings → restore existing backup | 5 / 2 / 3 plus recovery-key entry | Same | Restore backup, choose file, select it, preview, confirm. The preview shows counts. Restore creates a separate collection. |
| iPhone gallery → delete one item | 1 swipe + 2 taps / 1 / 2 | Same | Reveal Delete, tap it, confirm the named item. Cancel leaves both the record and selection intact. |

A returning collector with a local collection bypasses welcome. Sample timing measures a user's opportunity to see a worked identification. The primary activation outcome is still reading or saving **their own** piece. Photo handling, permission prompts, OCR and network latency make these different measures.

## Commercial design review

[Existing and proposed journeys](https://www.figma.com/design/cUeeyjgMCTELK2OEX353n5/?node-id=36-579) · [Choose one of the 12 offer variants](https://www.figma.com/proto/cUeeyjgMCTELK2OEX353n5/NumiAgent?node-id=39-462&starting-point-node-id=39%3A462) · [Editable design and prototype starts](https://www.figma.com/design/cUeeyjgMCTELK2OEX353n5/?node-id=31-4)

| Concept | Main decision | Strength | Risk to test |
| --- | --- | --- | --- |
| [A · Outcome](https://www.figma.com/design/cUeeyjgMCTELK2OEX353n5/?node-id=32-17) | Do I want a monthly summary for types I follow? | Concise and readable at larger text sizes. | A summary can sound too similar to free auction watches. |
| [B · Demonstration](https://www.figma.com/design/cUeeyjgMCTELK2OEX353n5/?node-id=32-38) | Would this dated report save me enough research time? | Shows a specimen and an illustrative realized lot with the price basis. | People might assume each month guarantees a new sale. Ask them what happens in a quiet month. |
| [C · Personalized](https://www.figma.com/design/cUeeyjgMCTELK2OEX353n5/?node-id=32-59) | Do I want to follow sales for this type? | The specimen already on screen explains the offer. | A very narrow type may see too few sales for a recurring charge. |

Start moderated testing with B. A collector can inspect what a report would contain and still check an individual sale for free. Place the entry after someone opens comparable sales and actively requests a preview. Dismissal returns to the sale. There is no offer at launch, capture, ambiguous identification, or after a provider error. A single saved record is enough context. Do not send holdings to an analytics service to personalize an offer.

The proposed U.S. example is $4.99 monthly with seven days free for eligible users. These are illustrative research terms. The prototype covers an ineligible standard offer, verified trial and paid success, pending approval, failure/retry, cancellation, restore with and without entitlement, and managing renewal until access expires. In a shipping implementation Apple would supply authoritative localized prices, eligibility, transaction state and subscription management. Product supply, rights to recurring data, delivery costs and commercial terms need approval before launch.

| Subscription journey | Current product | Proposed prototype taps / surfaces / decisions |
| --- | --- | --- |
| Free sale result → preview offer B | None | 2 / 2 / 1. Choose the contextual entry and preview. |
| Offer → continue free | None | 1 / 1 / 1. Returns to comparable sales. |
| Eligible offer → trial success | None | 2 / 2 / 1. Choose digest and confirm in simulated Apple sheet. |
| Offer → compare → standard paid success | None | 3 / 3 / 2. Review plans, select standard offer, confirm. |
| Settings → restore existing access | None | 2 / 2 / 1. Restore, then check purchases. Handles empty result. |
| Active plan → turn off renewal | None | 2 / 2 / 1 from management. Open Apple options and confirm. Access runs through the shown date. |

The design file uses editable Cabinet tokens, text and button variants in four device/appearance combinations. Figma states map to `GuestWelcome`, `GuestWorkspace`, `GuestPieceScreen`, `SpecimenScreen` and `NativeSales`. Digest and Apple purchase states exist only in the study. Simulator screenshots verify native screens. Figma frames document proposed purchase experiences and cannot establish conversion, billing, or accessibility performance.

[Measurement and experiment plan](collector-measurement.md) · [Global design principles](../../PRODUCT-DESIGN-PRINCIPLES.md) · [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) · [Apple subscription guidance](https://developer.apple.com/app-store/subscriptions/)
