# Architecture and implementation order

A single Worker serves Vue static assets and Hono REST routes, owns the auth and resource server roles for MCP, consumes a queue, runs photo Workflows, and performs hourly maintenance. There are no separate compute services. KV is scoped to the Cloudflare OAuth library's required grant and token store. D1 remains the authorization authority for every active OAuth consent, so deleting a consent or disabling its owner blocks access even if KV has an old token.

## Data and consistency

- D1 owns users, hashed login links and sessions, consent records, collections, specimens, photos, batches, sale records, valuation snapshots, themes, watches, and limit counters. Composite foreign keys prevent cross-account associations.
- A photo UUID is derived from its batch UUID and uploaded bytes. An interrupted upload can be repeated against the same batch. Reselect files with the same preprocessing choice. This resumes at whole-file granularity.
- New photo rows start in uploading state. The R2 write uses a conditional create. D1 transitions to manual or queued only after R2 succeeds. Cron requeues pending rows and handles abandoned uploads.
- The Queue starts a Workflow under one ID per photo and attempt. D1 state guards prevent stale or cancelled Workflow writes. The Workflow persists candidate JSON before advancing to review. Failed analysis can be retried or cataloged manually. Candidates and physical specimens are separate records.
- Photo links store side and crop coordinates. Multiple physical specimens can point to different regions of one photo. No private object URL is public. The authenticated Worker serves images with no-store.
- Search adapters accept only server-configured providers and allowed hosts. A feed's verified timestamps determine when a result can be marked active. Firecrawl results remain discovery links with unknown status. External text is rendered as text and is never sent to the vision model.
- A sale import is attested by the collector against an original lot page. Estimates use at least three strong, distinct observations on the supported grade, with a 24-month window and explicit buyer's premium normalization. Cross-currency observations require a source-linked exchange rate dated on the sale day or within the previous seven days. Portfolio totals include only specimens with sufficient USD evidence.
- Themes store editable matching rules and citations. Matched specimen counts are computed from confirmed items. The first-century template includes rulers whose reign overlapped AD 1–100.

## Implementation order

1. Establish schema, passwordless auth, private storage, and collection CRUD.
2. Add queue dispatch, durable recognition and review with batch recovery.
3. Add collector-attested sale evidence and a cited Roman theme template.
4. Add on-demand approved-provider search, saved watches and scoped MCP tools.
5. Verify locally with the Worker runtime, validate on staging using account credentials and restricted test data, then release on explicit authorization.

[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) · [Queues](https://developers.cloudflare.com/queues/) · [Workflows](https://developers.cloudflare.com/workflows/) · [MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
