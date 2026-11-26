# Collector feature parity

The iPhone and iPad use the same SwiftUI features. iPad adds a collection sidebar and uses the detail pane for a gallery or the selected piece. This review compares the collector-facing screens, including features available only after email sign-in.

| Collector task | Web account | iPhone and iPad account | Device-only collection |
| --- | --- | --- | --- |
| Identify and save a coin or banknote | Group photos into pieces, review matches, edit and save | Capture or import photos together, review matches, edit and save | Capture or import, read locally, optionally search online, save on device |
| Correct an identified record | Edit fields while keeping its identified type | Same | Same. Manual and unresolved records still allow a type choice |
| Find and inspect pieces | Overview and collection galleries, search, filters, pinch and pan on a touchscreen | Search, filters, gallery or list, pinch and pan | Search, filters, gallery or list, pinch and pan |
| Request a second opinion | Generate a share card from the saved specimen | Generate and share from the specimen screen | Generate and share from the device |
| Check prices and sales | Numista guide by issue and grade, auction results, record sale evidence | Same account services on the specimen screen | Optional Numista auction lookup using entered identifying fields. No automatic account valuation |
| Track collection gaps | Checklists, suggestions, gap searches and email watches | Checklists, suggestions, gap searches and email watches | Requires an account |
| Export records | Collection and insurance CSV, account JSON | Collection and insurance CSV, account JSON | CSV with private fields opt-in, encrypted backup and restore |
| Manage privacy | Account export, sessions, deletion and external photo-search preference | Same account controls | Offline storage, explicit photo search and optional browser access |

## Differences beyond the scan and gallery

- The web workspace offers standalone marketplace searches and saved searches. Native auction discovery starts from a checklist gap.
- The web catalog offers bulk record edits, portfolio JSON migration and bulk sale-evidence import. Both account clients can enter a single sale.
- Native account collectors can merge duplicate specimens. The web catalog lacks a merge control.
- The web Overview includes portfolio totals. The native collection opens directly on specimens.
- Developer API keys, MCP connections and usage administration live in the web workspace.
- Offline recognition, local drafts and encrypted device backups are native features. Signing in leaves the local collection on that device.

The shared scan and gallery paths have browser, Worker and simulator regression tests. Other entries above come from reviewing the feature entry points and their API calls. Provider availability and usage limits apply to both account clients.
