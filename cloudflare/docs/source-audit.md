# Open-source and data audit

| Project | Finding and decision |
| --- | --- |
| [Aurearia](https://github.com/briandenicola/Aurearia) | MIT. Its Vue interface, sets, capture review, and provenance model informed the product. Its Go/Gin/GORM/SQLite and FastAPI/LangGraph separation would require a runtime rewrite. Its registration, JWT/WebAuthn, sharing and API-key assumptions differ from a private multi-tenant service with email verification and OAuth consent. Preserve neither the first-user administrator bootstrap nor public asset assumptions during a migration. The public repository documentation and tree were inspected. A local clone was blocked by network restrictions. |
| [Kolektor](https://github.com/marinfrankovic/Kolektor) | MIT. Reference for two-sided capture, deskew, originals, and banknote-specific fields. Its backend uses PostgreSQL and server-side image processing. Reimplement the capture path in Vue and use Workers AI for candidate regions. |
| [Coin Analyzer](https://github.com/adamo-sys/coin-analyzer) | Apache-2.0. Reference for reviewing OCR and model evidence. Python desktop UI and local inference assumptions make direct reuse expensive. |
| [OpenNumismat](https://github.com/OpenNumismat/open-numismat) | GPL-3.0. Reference for metadata coverage, legacy import, and collector exports. Implement a separate validated JSON importer. |
| [Nomisma](https://www.nomisma.org/) | The project publishes its concepts under CC BY. Roman ruler names and URI pointers in the first-century template are attributed to Nomisma.org. The checklist and matching rules are authored for this application. |
| [OCRE](https://www.numismatics.org/ocre/apis) | ANS and ISAW make the OCRE database available under ODbL. Store links to catalog references as pointers. A future local copy or derived catalog should be reviewed under ODbL and images checked with each contributing institution. |

This implementation uses independently written application code, a generated landing illustration, and npm dependencies with their own notices. No upstream source files or auction photographs are bundled. Migration from Aurearia would require mapping user IDs, separating shared and private items, preserving media consent and associations, and validating old grades, prices and reference links. Do not import upstream credentials.

## Auction-source coverage

| Provider | Current integration route |
| --- | --- |
| [CNG](https://www.cngcoins.com/Terms%2Bof%2BUse.aspx) | Collector may record facts from an original lot page. Automated access requires an approved commercial route. |
| [biddr](https://www.biddr.com/) · [NumisBids](https://www.numisbids.com/terms) · [Sixbid](https://portal.sixbid.com/terms) | Auction syndicators. Verify platform and auction-house permissions for search, parsing, result disclosure, and alert polling before adding hosts or connecting a feed. |
| [CoinArchives](https://www.coinarchives.com/faq.php) | Offers public research and expanded access. A subscription alone does not establish feed or redistribution rights. |
| [acsearch](https://www.acsearch.info/terms.html) · [Heritage](https://coins.ha.com/c/ref/website-use-agreement.zx) | Terms restrict automated collection. Keep disabled unless separately authorized. |
| [eBay](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application) | Separate Browse listings and Marketplace Insights sales history. The latter requires restricted access. |
| [Firecrawl](https://docs.firecrawl.dev/api-reference/endpoint/search) | Discovery API. Allowlist source domains whose terms and rights permit the intended integration. Search snippets alone cannot verify availability or a realized sale. |

## Real evidence for a manual smoke test

Open CNG Electronic Auction 619, lot 715. The result reports a Vespasian denarius, RIC II.1 980, Near EF. It closed on 2026-10-21 at a USD 550 hammer price and a 20% buyer's fee. Enter this as one source-linked comparable. The detail view displays **Insufficient market evidence** with the original lot, grade, date, price, and basis. The production database starts empty. The integration test transcribes this single record and uses labeled synthetic records to exercise the range calculation. [CNG lot 715](https://www.cngcoins.com/Lot.aspx?BACK_URL=%2FLots.aspx%3FAUCTION_ID%3D243%26PAGE%3D4%26PAGE_NUM%3D200&LOT_ID=212313)
