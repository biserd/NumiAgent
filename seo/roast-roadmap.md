# NumiAgent SEO audit

November 15, 2026

The public site already served indexable HTML. The blog’s main gap was that readers could browse the footer but had few links from guide content to the next relevant guide or feature.

| Priority | Finding | Shipped fix |
| --- | --- | --- |
| Crawl control | The robots file prevented crawlers from reading the sign-in shell’s `noindex` tag | Allowed crawling of `/app` so the directive is visible. The app shell remains out of the sitemap and private APIs still require authentication. |
| HTTP status | The direct `/404` route returned a success status for an error page | The Worker serves HTTP 404 with the existing error template. Unknown blog URLs continue to return 404. |
| Discovery | Guides had no inline links in their paragraphs. Only one guide linked to Features from its main content. | Added inline links to related articles and specific feature sections. Features links back to all six guides. Each article has a visible link back to the blog and two related guides. |
| Coverage | Identification and paper money inventory had no dedicated guides | Published separate how-to articles and updated the four existing articles at their established URLs. |
| Freshness | The sitemap carried URLs alone | Article dates now appear in the sitemap, visible article metadata, and structured data. |

## Internal links

Counts use the publicly served HTML and count a source and destination once. Links in navigation, footers, and related-guide blocks are excluded from the guide body counts.

| Metric | Before | After |
| --- | ---: | ---: |
| Public URLs in the sitemap | 16 | 18 |
| Articles | 4 | 6 |
| Inline source-to-destination pairs in article paragraphs | 0 | 18 |
| Guide-to-guide link pairs in article sections | 3 | 13 |
| Guides with contextual links to Features | 1 | 6 |
| Unique internal destinations verified | 22 | 24 |

## Keyword coverage

| Guide | Search intent |
| --- | --- |
| [Photograph coins and banknotes](https://numiagent.com/blog/photograph-coins-and-banknotes) | Coin and banknote photography, glare, filenames, and pairing both sides |
| [Start a digital catalog](https://numiagent.com/blog/start-a-digital-coin-catalog) | Coin collection inventory, spreadsheet fields, provenance, and export |
| [Compare auction prices](https://numiagent.com/blog/compare-coin-auction-prices) | Prices realized, sold lots, hammer price, and buyer’s premium |
| [Build a Roman emperor checklist](https://numiagent.com/blog/build-a-roman-emperor-coin-checklist) | Defining and tracking a one-coin-per-emperor set |
| [Identify a Roman coin](https://numiagent.com/blog/identify-roman-coins) | Matching a legend, reverse design, or mint mark to a documented type |
| [Catalog a banknote collection](https://numiagent.com/blog/catalog-banknote-collection) | Paper money inventory, series, serial numbers, and signatures |

The keyword choices reflect search intent and overlap with current guides. Semrush had insufficient API units, and Search Console indexing and tracked AI citations were unverified. IndexNow accepted the eight substantially updated page URLs.

The live check covered the sitemap, canonicals, link targets and feature anchors, article metadata, RSS, the 404 route, and the sign-in shell. Requests to the new Roman guide using Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and Claude-SearchBot user-agent strings returned server-rendered HTML.
