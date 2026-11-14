# Cloudflare integration review

The review covers NumisGraph main at `863152d0` and the existing NumisVault implementation.

| Existing area | Integration |
| --- | --- |
| Collector portfolio | The authenticated [coin API](../server/routes.ts) exports a user's physical specimens. The Worker imports its JSON response per signed-in Cloudflare collector, preserving dates, dimensions, axis, inscriptions, notes, and catalog references. Source IDs make repeated imports safe. |
| Nomisma graph | [NumisGraph's RDF parser](../server/ingestion/nomisma-local-parser.ts) and checked-in RDF supply a compact seed of Roman rulers, mints, denominations and metals. The Worker uses those references in checklist generation, photo candidate review and its reference API. The full corpus stays in the repository. |
| Museum ingestion and rights | The [rights model](../shared/schema.ts) records separate permissions for metadata, images, rehosting, caching, embeddings, derivatives, attribution and expiration. Any future museum migration needs those fields and record-level provenance. The Cloudflare pilot uses only the selected Nomisma text concepts. |
| Research and watchlists | The existing app has text, hybrid and image similarity search, entity navigation, vendor ingestion, and graph enrichment. Its pgvector/CLIP pipeline and PostgreSQL graph continue to live in the original app. Cloudflare watches are for auction discovery. Existing rule-based watches and notification history need a separate mapping before a cutover. |
| Sign-in and photos | The existing app uses password hashes, PostgreSQL sessions and Replit object storage. The Worker uses verified email links and its own D1 and private R2 resources. A collector signs in independently and selects their portfolio export and original photos to transfer. |

The repository's legacy image record route returns metadata without an ownership gate, and the legacy coin and watchlist PATCH handlers pass request bodies through after checking the existing row's owner. Those boundaries need their own hardening before any broader exposure. The Cloudflare transfer reads the authenticated coin list and accepts file bytes from the collector. Its photo and write routes enforce ownership.

The legacy production bundle builds. The legacy TypeScript check still reports the inherited Express request typing errors for `isAuthenticated` in [the Replit object-storage routes](../server/replit_integrations/object_storage/routes.ts). The Cloudflare app has its own strict type check and CI workflow.

## Collector transfer

1. While signed in to the existing NumisVault app, open `/api/coins` on that same origin and save the response as a JSON file. It contains the signed-in account's records. Keep it private and out of Git.
2. Sign in to the Cloudflare NumisVault app. In **My collection**, open **Collection folders, import, and export**. Open **Transfer an existing portfolio** and choose **Import portfolio JSON**. Optionally select a target collection first. The importer retains both date endpoints and physical measurements. Reuploading the same export skips existing source IDs and preserves changes made in Cloudflare.
3. Use **Imports** to upload your original photos into private R2. Open a migrated specimen and use **Link an imported photo** to select a processed photo and assign its side. The legacy export's image IDs are reported as a count so you can reconcile photos separately. Legacy object URLs and credentials never enter the new account.
4. Compare the imported counts and spot-check dates, inscriptions and photos. The existing app remains the source of truth until an environment and data cutover are approved.

## Reference rebuild

The generated reference data is tracked so the Worker build can run with only Cloudflare dependencies. To refresh it, install the existing root dependencies and run `npm --prefix cloudflare run refs:build`. Run `npm --prefix cloudflare run refs:check` to verify that the committed output matches the bundled RDF. The generator reads exact Git paths, which works with a sparse checkout on Windows where the larger dump contains case-colliding filenames.

For a new Windows checkout of the Cloudflare app, clone with `--no-checkout`, then run `git sparse-checkout set --no-cone "/*" "!/nomisma-data/" "!/attached_assets/"` inside the clone before switching to the branch. The original app's bulk ingestion tasks still expect the full data corpus on a case-sensitive filesystem.

The seed uses English preferred and alternate labels from the CC BY concepts. It carries a canonical URI, license and attribution on every reference result. English search aliases added by the project are curated. A match identifies a reference concept for review. [Nomisma.org licensing statement](https://www.nomisma.org/)
