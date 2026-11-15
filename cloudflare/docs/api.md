# Client interfaces

The OpenAPI 3.1 document is at [public/openapi.json](../public/openapi.json) and is served by the Worker. REST browser calls use an HttpOnly session cookie. Send the exact configured Origin on browser writes. List specimens with `GET /api/v1/items?q=Trajan&type=coin&page=0`. Import files via a client-generated batch UUID, then PUT raw JPEG, PNG or WebP bytes to `/api/v1/imports/{id}/photos`. Repeating the same bytes in the same batch reuses the photo UUID.

Sign in and open Developer to create a named read-only API key. Use `Authorization: Bearer <key>` on operations marked with `developerKey` in OpenAPI. These include catalog, photo and import reads, themes, valuations, watchlists, references and marketplace search. Keys expire after 90 days. Each account has a shared limit of 120 developer REST requests per minute. Only the creation response shows the secret. Revoke access in Developer.

Use `GET /api/v1/exchange-rates?from=EUR&to=USD&date=2026-11-13` for the latest common ECB observation on or up to seven days before a sale. `GET /api/v1/references/ocre?id=ric.1%282%29.aug.208` returns a source-linked OCRE type. A licensed sale provider can be queried by owned specimen at `GET /api/v1/valuations/{id}/research`. Sales still need collector review before insertion. The browser session can edit selected fields with `PATCH /api/v1/items/bulk` and export insurance records at `GET /api/v1/items/insurance.csv`. The latter includes links requiring an authorized session. Download private images separately if sharing them with an insurer.

Transfer an authenticated legacy portfolio export with `POST /api/v1/items/import/numisgraph`. Send the original `/api/coins` rows as `coins` (up to 25 per call) and an optional `collectionId` owned by the current collector. The response counts imported and already-present rows and reports legacy photo references to reconcile. Use `GET /api/v1/references?q=caligula&kind=ruler` for Nomisma names, aliases, citations, and attribution.

## MCP

Configure a Streamable HTTP client with the exact public Worker origin and `/mcp`. It discovers the authorization server from the 401 resource metadata, registers a client, and initiates OAuth authorization code with S256 PKCE. The collector signs in, reviews the client name and destination, and approves the single `collection:read` scope. Authorizations can be revoked in Developer. Tool results include a JSON object in `structuredContent.data`. OAuth access tokens expire in 15 minutes. The OAuth provider manages refresh tokens and authorization codes.

| Tool | Input | Result |
| --- | --- | --- |
| search_my_collection | query, optional type and page | Matching physical specimens |
| get_collection_item | itemId | Owned specimen, photo IDs, same-reference duplicates |
| get_collection_statistics | none | Specimen, photo and storage counts |
| list_my_themes | none | Owned themes |
| get_missing_items | themeId | Missing and owned slots with source links |
| identify_coin_or_banknote | photoId | Existing job state and candidate observations for an owned photo |
| get_valuation | itemId, optional currency | Range or insufficient evidence, plus sale records |
| get_recent_sales | itemId | Recorded sales with source links and provenance |
| search_market | query | Results, status, retrieval time and provider coverage |
| find_missing_items_for_sale | themeId, label | Discovery results for one still-missing slot |

MCP reads private records including notes and attribution data. Marketplace calls send their query terms to configured external providers. Listing status may remain unknown when the provider is a search index. To authorize a client from a different browser than the email link opens, complete sign-in and reopen the client's authorization URL in that signed-in browser.

## Future iPhone app

Reuse the same import IDs, byte upload, status, review, catalog, and evidence endpoints. Implement a first-party OAuth audience for the versioned REST API, with scoped access and refresh, ASWebAuthenticationSession and PKCE. Use a universal-link or registered first-party callback, Keychain storage and token revocation. Replace the browser cookie requirement for OAuth-authenticated API requests only after authorization and replay tests pass. Use PhotosUI and AVFoundation for selection and capture, ImageIO for HEIF/EXIF-aware resizing, background URLSession for durable transfer, and local batch IDs and per-file digests for retries.
