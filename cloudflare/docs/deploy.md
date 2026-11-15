# Cloudflare setup and operations

Use a separate Workers environment and separate bindings for staging and production. The repository contains a local Wrangler configuration and an environment-specific config generator. Role-specific Cloudflare API tokens and explicit deployment approval belong in the respective GitHub environments.

## Create and bind resources

1. Choose one canonical HTTPS origin per environment and confirm the Worker custom domain or workers.dev address. In **Workers & Pages → D1**, create `numisgraph-staging` and `numisgraph-production`. Record their database IDs. In **Workers KV**, create a separate OAuth namespace for each.
2. In **R2**, create the corresponding `numisgraph-{environment}` bucket. Leave public access and public development URLs disabled. Configure incomplete multipart upload expiry as appropriate. Private object retention follows account deletion and abandoned-upload cleanup.
3. In **Queues**, create `numis-identify-{environment}` and `numis-dead-{environment}`. Wrangler attaches the consumers and registers the Workflow and hourly Cron Trigger.
4. Enable **Workers AI** for both environments. The default model is Gemma 4 26B A4B through the Workers AI binding. Review model availability and pricing. Use a staging-only set of collector-authorized benchmark photos. [Model documentation](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
5. In **Email Service → Send emails**, onboard and verify the sending domain. Add the requested DNS records, then verify the sender and test a staged magic link. Set its address as `NUMIS_EMAIL_FROM`. [Email Service setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
6. In **Turnstile**, create a widget for the canonical hostname. Set `NUMIS_TURNSTILE_SITE_KEY` and install its secret on the matching Worker. Verify both accepted and rejected staging challenges. [Server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
7. Set environment variables `NUMIS_APP_ORIGIN`, `NUMIS_D1_ID`, `NUMIS_OAUTH_KV_ID`, `NUMIS_EMAIL_FROM`, and `NUMIS_TURNSTILE_SITE_KEY`. Optionally set `NUMIS_AI_PER_USER`, `NUMIS_AI_GLOBAL`, `NUMIS_MARKET_DOMAINS`, and `NUMIS_MARKET_FEED_URL`. Leave market configuration empty until source access is approved.

Generate the correct Wrangler configuration with `node scripts/cloudflare-config.mjs staging` (use `production` only for the production resources). Use `wrangler secret put TURNSTILE_SECRET --config wrangler.deploy.json` and optional `FIRECRAWL_API_KEY`, `MARKET_FEED_TOKEN`, and `BUDGET_ALERT_EMAIL` via the same mechanism. Deploy with the manually dispatched workflow after local and staging verification, or apply remote D1 migrations and deploy locally using `--config wrangler.deploy.json`. Confirm the target and resources before executing either operation.

## Approved marketplace feed contract

The fixed HTTPS feed receives a GET with URL-encoded `q`. It returns a JSON array of up to 50 entries. Each has `url`, `title`, optional `description`, `auctionHouse`, `auction`, `lot`, `state` (active, closed, or unknown), `closesAt` and `verifiedAt` (ISO timestamps). Optional price fields are `kind`, `amount`, `currency`, and `premium` (percentage). The Worker marks an active lot only with a current verification timestamp and future closing date. The result URL host must match the configured domain list. Redirects from feed and Firecrawl requests are rejected. Alerts use only active feed results and refresh opted-in watches at most daily under scheduler and provider budgets.

For eBay auctions, obtain [Buy API production approval](https://developer.ebay.com/api-docs/buy/static/buy-requirements.html) for the search, display and watch-alert use you intend. Install `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` with Wrangler secrets. Set `NUMIS_EBAY_MARKET_ENABLED=true` during config generation. The adapter uses Browse in the US Coins & Paper Money category, verifies auction end dates and labels bid prices separately from realized sales. Before enabling alerts, verify that the approved agreement permits that use.

For a licensed realized-sale provider, configure `NUMIS_SALE_FEED_URL`, the original auction page hosts in `NUMIS_SALE_SOURCE_DOMAINS`, and optionally the `SALE_FEED_TOKEN` secret. The server sends GET with `reference` and `type`. Supply a JSON array of up to 50 results matching the OpenAPI Sale fields with `reference` and without the collector's `sourceChecked` attestation. The app only returns exact-reference, allowlisted records for collector review. The provider's agreement must cover this retrieval and display. Retain its attribution and verify real records before release.

ECB dated reference conversions and OCRE exact-type lookups use public endpoints with separate per-user and global quotas. They send currency/date or type ID only. OCRE labels and metadata are credited to ANS and NYU ISAW under ODbL 1.0. The app stores a source link when the collector attaches a reference.

## Limits and cost

Current caps are 300 unique images per batch, 6 MB per individual image, 2 GiB stored photo bytes per user, 650 upload requests per user per UTC day, 400 AI invocations per user and 4,000 globally per UTC day, and 30 market calls per user and 300 globally per UTC day. AI retries consume quota. The default per-user AI limit accommodates a batch of 100–300 under light retry load. Cloudflare's own service limits apply independently.

Set `NUMIS_MARKET_PER_USER` and `NUMIS_MARKET_GLOBAL` to adjust the search budgets. Set `NUMIS_VISION_MODEL` after comparing consented vision benchmarks. The optional `BUDGET_ALERT_EMAIL` receives at most one successful alert per UTC day when AI or marketplace calls reach 80% of their configured global limit.

For a pilot, assume 5,000 uploads at 0.6 MB each, 35,000 reads, 3,000 processed photos, and under 10 GB stored monthly. Planned baseline is approximately $5/month on Workers Paid while within included allowances. Gemma 4 at 2,500 input and 600 output tokens per image would add roughly $1.29 before retries. Email, search, commercial feeds, taxes, and overages depend on actual usage and entitlements. The usage calculator lives in Settings. Set Cloudflare billing alerts, check Workflow and queue backlogs, and review provider usage during the pilot. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

## Recovery and monitoring

The public contact form uses the production Turnstile widget and stores messages in the private `contact_messages` D1 table. Operators with D1 access can review the inbox and use the reply email supplied by the sender. Cloudflare Email Sending's login sender is an outbound address. A scheduled cleanup removes contact rows older than 90 days.

```sh
npx wrangler d1 execute DB --remote --config wrangler.deploy.json --command "SELECT id, email, topic, message, datetime(created, 'unixepoch') AS received_at FROM contact_messages ORDER BY created DESC LIMIT 25"
```

- Filter Workers Logs by failed photo, queue delivery failures, email delivery failures, or watch refresh failures. Keep request-level URL logging disabled on the deployed worker. Inspect the dead-letter and pending queues and use the in-app retry path for failed photos.
- Before data migrations, record a D1 Time Travel bookmark and export the schema and data to access-controlled storage. Use a separate, access-controlled R2 backup of private objects when appropriate for the retention policy. Keep original object keys so restored D1 photos can find their blobs.
- Restore and test in an isolated environment first. After any restore, reconcile D1 photo rows against R2, reapply deletion requests recorded after the restore point and invalidate old sessions and OAuth grants. Do not treat D1 recovery as a backup of R2 or KV.
- Validate the exact public host behavior, sandbox provider credentials, consent, diagnostic access, retry handling, and native asset behavior on staging before accepting collector data.
