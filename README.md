# NumisGraph

NumiAgent is a private catalog for coins and banknotes. This repository contains its Cloudflare application and the original NumisGraph research application. NumiAgent lives under [cloudflare/](cloudflare/README.md).

## Cloudflare pilot

Use Node 24.11 or newer. Install and run the Worker from the repository root.

```sh
npm --prefix cloudflare ci
npm run cloudflare:build
npm run cloudflare:db:local
npm run cloudflare:dev
```

Open http://127.0.0.1:8787 and use the local sign-in link. Staging and production use separate Cloudflare resources and a manual deployment workflow.

- [Repository review and migration plan](docs/cloudflare-integration.md)
- [Cloudflare deployment](cloudflare/docs/deploy.md)
- [REST and MCP](cloudflare/docs/api.md)

## Existing application

The [original architecture and setup](replit.md) describe the React UI, Express APIs, PostgreSQL schema, museum corpus, and Nomisma graph. The original root scripts continue to run that application. Refreshing the Cloudflare reference data uses the repository's existing RDF parser and dependencies.
