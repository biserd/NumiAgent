# Pilot verification

## Local checks

- Strict Vue and Worker TypeScript check.
- Production web asset build and Wrangler deployment bundle dry runs with isolated placeholder bindings.
- Unit tests cover exact theme matching, source-backed reference lookup, legacy coin conversion, sale-evidence selection, dated currency conversion and CSV formula escaping.
- Wrangler integration test performs magic-link sign-in, link replay rejection, CSRF rejection, private photo isolation, a 101-image Queue and Workflow run, item save/search, synthetic sale valuation, Roman theme gaps, configured-market coverage reporting, MCP registration and PKCE token exchange, MCP tool calls, token revocation, and account cleanup.
- Browser tests run a narrow touch viewport with sign-in, photo selection, specimen review, catalog search, evidence status, marketplace coverage and legacy coin transfer with a private photo.

## Security review

- The runtime stores magic-link and session token digests, atomically consumes each sign-in link, restricts browser mutations by origin, and rechecks photo, specimen, theme, and OAuth grant ownership on each protected request. Automated tests cover token replay, cross-account access, unsafe origin, and revoked grants.
- Uploaded files are size-capped and checked for a supported binary signature. R2 keys are internal and reads require the active user's session. Account deletion disables the user first. Cron deletes that user's private media and metadata.
- Marketplace requests go only to configured endpoints, reject redirects, and check result hostnames. Sale and reference links require HTTPS. Private photo content is sent to Workers AI only for batches marked for analysis.
- The npm production dependency audit reported zero known advisories on 2026-11-14. Staging still needs verification of email and Turnstile behavior, source-provider access, throughput and the backup/restore runbook before real collector onboarding.

## Staging checks that require real resources

| Scenario | Staging verification |
| --- | --- |
| Bulk cataloging | Send more than 100 collector-authorized images, including banknotes, trays, two-sided pairs, and common iPhone formats. Measure actual object counts, attribution errors, crop quality, review time, queue latency, retries, and per-batch cost. |
| Sale valuation | Record the published CNG example in the source audit and verify the displayed price basis. Collect at least three legitimately comparable lots from an approved evidence path before checking a range. |
| Themes | Confirm the Nomisma-linked first-century emperor checklist and inspect its coverage with a real collection. |
| Marketplace | Configure credentialed access and approved source terms. Compare active vs. closed status with publisher records and check watch delivery. |
| Agent | Connect a deployed, HTTPS MCP client and verify authorization, scope and grant revocation. |
| Cloudflare | Verify the production-style Email Service binding, Turnstile, Cron, Workflows, queue failure, deletion and backups against isolated staging resources. |

## Model benchmark

Use private, consented photos and a temporary account-scoped Workers AI token. Build a JSON array with `file` (relative path), `consent: true`, and `expected` (an array of objects with `type` and any known `issuer`, `ruler`, `denomination`, and `reference`). Run:

```sh
node scripts/vision-benchmark.mjs /private/fixtures/manifest.json @cf/google/gemma-4-26b-a4b-it
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` through the environment. Comparing multiple supported vision models requires explicit agreement to the inference budget. The report includes response success, exact object count, type and field agreement, and latency. Audit crop accuracy separately against labeled photos before enabling wide rollout. The current configured model is a pilot choice based on published support for image inputs.

## Scope of this build

Photo selection and browser conversion are tested on an Edge touch viewport. iPhone Safari, HEIF conversion, camera hardware, object-region accuracy, and evidence of sustained production throughput require device and staging checks. Unsupported HEIF files need conversion in a browser or app that can decode them. Users can pair sides and correct crop percentages manually. Crop coordinates are stored with item-photo associations.

The first-century Roman template uses documented ruler references. Broader natural-language catalog compilation and a live OCRE type matcher are future work. Sale data entered by collectors stays labeled as collector-attested. Mixed currencies require dated and sourced conversion before they can be compared. The marketplace adapter is ready for configured providers, and its verified coverage is empty on the default offline setup. Email alerts run only for opted-in watches with an approved structured feed.
