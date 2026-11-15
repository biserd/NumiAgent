# NumiAgent

A private, Cloudflare-native catalog for coins and banknotes. It ships a Vue web app, a Hono API, and a stateless remote MCP server in one Worker project.

The production app is available at [numiagent.com](https://numiagent.com). Its public developer guides cover [REST API and MCP access](https://numiagent.com/developers/access).

This app runs alongside NumisGraph's original collector and research app. The [integration guide](../docs/cloudflare-integration.md) covers legacy coin transfer, private photo linking and the bundled Nomisma references.

## Run locally

Use Node 24.11 or newer and npm. Run these commands from this directory.

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

Visit http://127.0.0.1:8787. Enter an email address and open the local sign-in link displayed on the page. The offline runtime uses D1, R2, Queues, Workflows, and KV through Wrangler. With no AI binding, submitted photos remain available for manual cataloging. The test suite enables a deterministic synthetic vision response in an isolated runtime. The dashboard and catalog start empty.

1. Open **Imports**, add photos from the library or camera, and open a processed photo to catalog it. To resume an interrupted batch, reopen it, select the same photos and preprocessing choice, and use **Add to open batch**.
2. Open a specimen in **Collection** and record a realized sale from the original lot page. The instructions in the source audit include a public CNG example.
3. In **Themes**, preview a first-century Roman emperor checklist, save it, and select **Search auctions** for a missing slot.
4. Under **Settings**, export account data, manage sessions and OAuth grants, and estimate monthly operating costs.

## Verify

```sh
npm run check
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Build before the integration or browser suites. They launch isolated local Workers on ports 8791 and 8792. The browser suite accepts `PLAYWRIGHT_CHANNEL=msedge` for machines with Edge already installed. The OpenAPI schema is available at `/openapi.json` and can be regenerated with `node scripts/openapi.mjs`.

- [Architecture](docs/architecture.md)
- [OSS, licensing, provider access, and a real sale example](docs/source-audit.md)
- [Staging and production setup](docs/deploy.md)
- [REST and MCP integration](docs/api.md)
- [Verification and release status](docs/verification.md)
