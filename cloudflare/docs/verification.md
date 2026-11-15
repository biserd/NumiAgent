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

On November 14, 2026, two public reference images were sent to Gemma 4 and Qwen 3.8 on Workers AI. Both models returned valid results and detected the expected coin or banknote type in both images. Each matched the expected object count and all specified attribution fields in one of the two images. The model setting remains configurable. This smoke test leaves mixed trays, production throughput, iPhone capture, and representative accuracy to be measured with more images.

Images used for this smoke test were the [Yale University Art Gallery Trajan denarius, inventory 1938.6000.2894](https://commons.wikimedia.org/wiki/File%3ADenarius_of_Trajan%2C_Emperor_of_Rome_from_Rome%2C_Yale_University_Art_Gallery%2C_inv._1938.6000.2894_-_YDEA_-_134662.jpg) and a [public-domain 1896 five-dollar silver certificate](https://commons.wikimedia.org/wiki/File%3A5_Silver_US_Dollars_1896.jpg). Neither image is bundled with the application.

Use private, consented photos and a temporary account-scoped Workers AI token. Build a JSON array with `file` (relative path), `consent: true`, and `expected` (an array of objects with `type` and any known `issuer`, `ruler`, `denomination`, and `reference`). Run:

```sh
node scripts/vision-benchmark.mjs /private/fixtures/manifest.json @cf/google/gemma-4-26b-a4b-it
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` through the environment. Comparing multiple supported vision models requires explicit agreement to the inference budget. The report includes response success, exact object count, type and field agreement, and latency. Audit crop accuracy separately against labeled photos before enabling wide rollout. The current configured model is a pilot choice based on published support for image inputs.

## Scope of this build

Photo selection and browser conversion are tested on an Edge touch viewport. iPhone Safari, HEIF conversion, camera hardware, object-region accuracy, and evidence of sustained production throughput require device and staging checks. Unsupported HEIF files need conversion in a browser or app that can decode them. Users can pair sides and correct crop percentages manually. Crop coordinates are stored with item-photo associations.

Sourced themes cover first-century Roman emperors and the 1935, 1937, and 1954 Bank of Canada series by denomination. A real Workers AI request produced three editable Byzantine solidus rules for the sixth through eighth centuries with the requested denomination and date boundaries. Custom AI rules remain editable suggestions. Matching reports reference gaps and suggests three missing slots to review. OCRE exact-type lookup and dated ECB conversion were exercised against both real providers from a Cloudflare preview.

The actual app was tested with three individually reviewed Tiberius denarii attributed to RIC I 30 and graded Good VF. The calculation used [CNG EA 609 lot 581](https://www.cngcoins.com/Lot.aspx?LOT_ID=196094), [CNG EA 607 lot 559](https://www.cngcoins.com/Lot.aspx?LOT_ID=191317), and [CNG EA 616 lot 669](https://www.cngcoins.com/Lot.aspx?LOT_ID=206013). The three hammer prices were USD 550, 1,300, and 1,600 with 20% premiums. The isolated test returned a USD 1,110–1,740 range with a USD 1,560 median. These are source facts used for verification, with Lyon varieties and surfaces that vary by specimen. The example remains outside production collection data.

eBay Browse and the licensed sale-feed adapter require approved production configuration. Realized prices entered or imported by a collector remain collector-attested. Portfolio estimates use compatible dated currency observations and accepted grades. Verify authorized listings and opted-in alert delivery before enabling a live source.
