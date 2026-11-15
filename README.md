# NumiAgent

NumiAgent helps coin and banknote collectors turn a photo backlog into a private catalog, identify unfamiliar pieces, compare realized auction prices, and see what’s missing from a set.

Visit [numiagent.com](https://numiagent.com) or read the [developer documentation](https://numiagent.com/developers) for the REST API and MCP server.

## Run NumiAgent locally

Use Node.js 24.11 or newer. The web app, Worker, and tests are in [`cloudflare/`](cloudflare/README.md).

```sh
git clone https://github.com/biserd/NumiAgent.git
cd NumiAgent
npm --prefix cloudflare ci
npm run cloudflare:build
npm run cloudflare:db:local
npm run cloudflare:dev
```

Open [the local app](http://127.0.0.1:8787) and use the sign-in link it displays. Deployment setup and Cloudflare bindings are documented separately.

- [Cloudflare deployment guide](cloudflare/docs/deploy.md)
- [REST API and MCP integration](cloudflare/docs/api.md)
- [Architecture](cloudflare/docs/architecture.md)

## NumisGraph research app

This repository also contains the original NumisGraph research app, which uses React, Express, PostgreSQL, and Nomisma linked data. Its setup is in [`replit.md`](replit.md). The [integration notes](docs/cloudflare-integration.md) cover migration to NumiAgent.
