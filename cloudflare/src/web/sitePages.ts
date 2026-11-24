import { developerKeyLifespanDays, developerRequestLimit } from '../shared/developerAccess'
import { blogPosts } from './blogPosts'
import { banknoteAppPath, collectorPages, photoIdPath } from './collectorPages'
import { iosLandingPath } from './launch'

export const brand = 'NumiAgent'
export const canonicalOrigin = 'https://numiagent.com'
export const landingSeo = {
  title:'Private Coin & Banknote Collection App | NumiAgent',
  description:'Scan and identify coins and banknotes on iPhone and iPad. Build a searchable offline collection, choose which photos to search online, and keep an encrypted backup.'
}

type Link = {href:string;label:string}
type Paragraph = string | {before:string;link:Link;after:string}
type Section = {id?:string;title:string;paragraphs:Paragraph[];links?:Link[];code?:string}
export type SitePage = {
  label:string
  title:string
  seoTitle?:string
  description:string
  sections:Section[]
  effective?:string
  launchActions?:boolean
  image?:{path:string;alt:string}
  lastModified?:string
  breadcrumbParent?:Link
  article?:{topic:string;published:string;updated?:string;related:string[]}
}

export function pageBreadcrumbs(path:string,page?:SitePage):Link[] {
  if (!page) return []
  const parent = page.article ? {href:'/blog',label:'Coin and banknote collecting guides'} : page.breadcrumbParent
  return parent ? [{href:'/',label:brand},parent,{href:path,label:page.title}] : []
}

const contact = {href:'/contact',label:'Contact NumiAgent'}
const help = {href:'/help',label:'Read the collector guide'}
const app = {href:'/app',label:'Open your collection'}
const features = {href:'/features',label:'Explore NumiAgent features'}
const developerAccess = {href:'/app#developer',label:'Open developer access'}
const accessGuide = {href:'/developers/access',label:'API and MCP access'}
const apiGuide = {href:'/developers/api',label:'REST API guide'}
const mcpGuide = {href:'/developers/mcp',label:'MCP connection guide'}
const openApi = {href:'/openapi.json',label:'OpenAPI 3.1 specification'}
export const developerLinks = [
  {href:'/developers',label:'Overview'},
  {href:accessGuide.href,label:'Access'},
  {href:apiGuide.href,label:'REST API'},
  {href:mcpGuide.href,label:'MCP'}
]

export const sitePages:Record<string,SitePage> = {
  ...collectorPages,
  '/blog':{
    label:'Blog',title:'Coin and banknote collecting guides',
    seoTitle:'Coin & Banknote Collecting Guides | NumiAgent',
    description:'Learn to photograph coins, identify Roman types, catalog paper money, compare auction prices realized, and build a collection checklist.',
    sections:[]
  },
  ...Object.fromEntries(blogPosts.map(post=>[post.path,post])),
  '/about':{
    label:'About',title:'About NumiAgent',
    description:'Why I’m building a private catalog that keeps coins, banknotes, and the research behind them together.',
    sections:[
      {title:'Why I’m building NumiAgent',paragraphs:[
        'A coin can fit in the palm of your hand. The work of figuring out what it is can take up a tray, a spreadsheet, and half a browser window. I wanted one place to keep the photographs, the attribution I settled on, and the sources I’d want to check again later.',
        'I want NumiAgent to help with the jobs that put collecting on hold. There’s the camera roll you still need to sort, the coin you haven’t identified, the price you can’t trace to a sale, and the set you keep checking to remember what’s missing. Those are the problems I keep coming back to as I build it.'
      ]},
      {title:'Leave room to be unsure',paragraphs:[
        'The interesting part of identification is often the doubt. A worn legend can change the reading. A banknote may look familiar until you turn it over and notice a different signature. NumiAgent offers suggestions for you to review, with space to correct the crop, pair the two sides, and record your own attribution.',
        'I take the same approach to prices. When you record a comparable sale, the date, grade, price basis, and original lot link stay with it. If the evidence is too thin for a range, I want the catalog to say so plainly.'
      ]},
      {title:'Keep it yours',paragraphs:[
        'My collection can have notes, purchase details, and photos I want to keep to myself. That’s why I built a way to start on iPhone or iPad without an account. You can decide which individual photos to search online, keep an encrypted backup, or open a separate collection in your browser when you want one.',
        'Collectors should also be able to check the sources behind the software. Aurearia informed some of the collecting workflows. Public Nomisma records give selected rulers, mints, denominations, and materials a link back to a numismatic reference.'
      ],links:[{href:'https://github.com/briandenicola/Aurearia',label:'Aurearia'},{href:'https://nomisma.org/',label:'Nomisma'}]},
      {title:'Tell me what your catalog is missing',paragraphs:[
        'If you use NumiAgent and hit a point where you reach for your spreadsheet or notebook, I’d like to hear what you were trying to record. The same goes for an attribution that was hard to correct or a checklist that didn’t match the way you collect.'
      ],links:[contact,features,app]}
    ]
  },
  '/features':{
    label:'Features',title:'NumiAgent features',
    seoTitle:'Coin Catalog, Photo ID & Valuation Tools | NumiAgent',
    description:'Clear your photo backlog, identify unfamiliar coins and banknotes, compare actual auction sales, and track the pieces you still need.',
    launchActions:true,
    sections:[
      {id:'photo-imports',title:'Turn the photo backlog into a catalog',paragraphs:[
        'On iPhone and iPad, start without an email, capture or import photos, and pair both sides. Accepted photos and unfinished pieces are saved on your device so you can resume later.',
        'In the separate web account, import a photo batch from your phone or computer, name it so you can find it later, and see which images are ready for review.'
      ],links:[{href:iosLandingPath,label:'See the coin collection app for iPhone and iPad'},{href:'/app#imports',label:'Open photo imports'},{href:'/blog/photograph-coins-and-banknotes',label:'Photograph coins and banknotes for a batch'}]},
      {id:'identification',title:'Get unstuck on a mystery coin or banknote',paragraphs:[
        'Review likely matches, possible matches, or a request to review the piece yourself. Local recognition runs automatically when you add a photo. For a second opinion, select the individual photos you want to send for online identification.'
      ],links:[{href:photoIdPath,label:'Identify a coin from a photo'},help,{href:'/blog/identify-roman-coins',label:'Identify a Roman coin from its features'}]},
      {id:'catalog',title:'Build and search a private catalog',paragraphs:[
        'Save coins and banknotes in named collection folders. Record issuer, denomination, date, grade, references, notes, measurements, inscriptions, and type-specific details. Find pieces with text search and filters, inspect potential duplicates that share a reference, and see collection and import counts on the overview.',
        'Edit selected fields across up to 50 specimens at once. Look up a Roman coin type in OCRE and attach its source link. Export a standard or insurance inventory CSV, download account data as JSON, or transfer a supported NumisGraph portfolio export.'
      ],links:[{href:'/app#collection',label:'Open the collection'},{href:banknoteAppPath,label:'Organize your banknote collection'},{href:'/blog/start-a-digital-coin-catalog',label:'Set up a digital coin inventory'},{href:'/blog/catalog-banknote-collection',label:'Catalog a banknote collection'}]},
      {id:'valuation',title:'Find out what comparable pieces sold for',paragraphs:[
        'Give every estimate a trail you can follow. Enter comparables or import verified sale records with original lot links. Look up a dated ECB reference rate when sales use different currencies. When enough comparable records support a range, you’ll see it in the specimen’s valuation history. When evidence is thin, the catalog says so.'
      ],links:[{href:'/blog/compare-coin-auction-prices',label:'See how to compare realized auction prices'}]},
      {id:'checklists',title:'See which pieces your set still needs',paragraphs:[
        'Before you go looking for another piece, see what you already have. Start from a sourced Roman emperor or Canadian banknote checklist, or ask for a draft of your own rules. Review the suggestions, then see what matches, which records need references, and which gaps to research first.'
      ],links:[{href:'/app#themes',label:'Open themes'},{href:'/blog/build-a-roman-emperor-coin-checklist',label:'Build a Roman emperor coin checklist'}]},
      {title:'Search auctions and save watches',paragraphs:[
        'Keep a set of searches for pieces you’re looking for and revisit them from Marketplace. When an auction source is configured, results show their source and verification status. Saved watches can send alerts for verified active lots through an approved feed. Live auction coverage is currently unavailable.'
      ],links:[{href:'/app#marketplace',label:'Open marketplace'}]},
      {title:'Connect your own software',paragraphs:[
        'Create a revocable REST API key for scripts, or approve an OAuth connection for a compatible MCP client. Both use read-only permissions for your account. Use them to query your catalog, check themes, or pull valuation evidence for research.'
      ],links:[{href:'/developers',label:'Developer documentation'},accessGuide]},
      {title:'Control your account and data',paragraphs:[
        'Use an encrypted backup to move your guest collection. Export a spreadsheet and choose whether to include private fields. Open the separate web account when you choose. Signing in keeps your guest collection on your device.',
        'In the web account, sign in with an email link. Manage sessions, check usage, export records, or request deletion from Settings. Revoke API keys and MCP connections in Developer.'
      ],links:[{href:'/privacy',label:'Privacy Policy'},app]}
    ]
  },
  '/terms':{
    label:'Terms',title:'Terms of Service',effective:'November 14, 2026',
    description:'The terms that apply when you use the NumiAgent website, catalog, APIs, and connected tools.',
    sections:[
      {title:'Your account',paragraphs:[
        'Keep control of the email address used to sign in. Sign-in links are for your use. Revoke sessions in Settings and revoke API keys or connected tools in Developer access.'
      ]},
      {title:'Your collection and uploads',paragraphs:[
        'You retain ownership of your photographs and collection records. Upload material you have permission to use. You authorize NumiAgent to process photos you select for guest search and to store photos you add to your online account. AI analysis follows the consent choice you make for each search or account photo batch.'
      ]},
      {title:'Identifications and valuation evidence',paragraphs:[
        'Identification candidates and valuation ranges are research aids. Review the attribution, condition, and comparable sales before you rely on an estimate or make a purchase. NumiAgent does not authenticate specimens or issue appraisals.'
      ]},
      {title:'Auction listings and outside services',paragraphs:[
        'Listings can change or close. Check availability, fees, and terms at the source. Purchases and bids are handled by the seller or auction house under its own terms.'
      ]},
      {title:'Acceptable use',paragraphs:[
        'Use the service lawfully. Respect the rights of owners, auction houses, and catalog providers. Keep within usage limits and use only the permissions granted to your account or connected tools.'
      ]},
      {title:'Beta availability and account closure',paragraphs:[
        'Features, limits, and source coverage can change during the beta. You can export your catalog or request account deletion from Settings. The Privacy Policy describes how personal data is handled.'
      ],links:[{href:'/privacy',label:'Privacy Policy'},contact]}
    ]
  },
  '/privacy':{
    label:'Privacy',title:'Privacy Policy',effective:'November 17, 2026',
    description:'How NumiAgent handles account information, photographs, collection records, and support messages.',
    sections:[
      {title:'Information used to run your account',paragraphs:[
        'We use your email address to sign you in and manage your account. A session cookie keeps you signed in. We record limited usage and security information to protect the service and enforce usage limits.'
      ]},
      {title:'Photographs and collection records',paragraphs:[
        'Your uploaded photographs and catalog are private to your account. When you consent to AI analysis for a batch, Cloudflare Workers AI processes the photographs for identification suggestions. You can also catalog them manually.',
        'A second-opinion card includes the photos you preview, the tentative identification, recorded inscriptions, specimen details, available auction evidence and your chosen question. Your purchase price appears only when you select “Include my purchase price” for that card. You choose where to share the image. When you generate a custom frame in the web catalog, Cloudflare Workers AI receives the frame style and one sampled color per photo. Your browser combines the frame with your photos.',
        'The iPhone and iPad app can store a guest collection on the device without an account. Signing in or choosing to open the browser gives you access to a separate online collection. Guest photos and records stay on your device when you open the browser or sign in.',
        'If you request an online search for a local piece, only the photos you select are sent to NumiAgent for processing by Cloudflare Workers AI. The request excludes catalog notes, prices and email. The photos are processed for that search without being added to an online collection. Access to the online result expires after twenty minutes. Expired results are removed on the next scheduled cleanup.'
      ]},
      {title:'Services and connected tools',paragraphs:[
        'Cloudflare hosts the site, stores app data, checks for abuse, and delivers sign-in email. An AI theme preview sends your collecting request to Workers AI. If you enable external photo search in Settings, identification may send up to two cropped coin photos to Syllogeum and Google Cloud Vision. You can turn that setting off at any time. Older app versions can send photos when you select one of those services directly. Reference discovery can use observed inscriptions, design descriptions or printed identification fields as search terms. Opening a signed-in specimen can send its issuer, denomination, year and piece type or catalog IDs to Numista for guide estimates. Automatic auction checks send missing checklist search terms to marketplace providers. Email alerts are optional. ECB lookups send currency codes and a date. Auction searches and comparable-sale lookups can send your search terms or reference to configured providers.',
        'Your browser requests site typefaces from Google Fonts. A connected agent or API integration can read records within the access you grant it. NumiAgent stores a hash of each API key and retains its label, scope, and expiry while the key is active.'
      ]},
      {title:'Support requests',paragraphs:[
        'The contact form stores your reply email, topic, and message so the operator can review and respond. Contact messages are scheduled for deletion from the active inbox after 90 days. Omit payment details, sign-in links, and other sensitive information.'
      ]},
      {title:'Optional website analytics',paragraphs:[
        'If you allow analytics, Google Analytics uses cookies to count visits to public pages and record actions such as requesting a launch email or opening the web catalog or App Store. These events contain the page path and action, without your email, collection details, or URL query strings and fragments. Analytics runs on public pages and excludes the signed-in workspace and launch-email management. You can change your choice in the footer.'
      ]},
      {id:'launch-email',title:'App Store launch email',paragraphs:[
        'If you request a launch email, we use the address you provide to send a confirmation and one launch announcement. The list is separate from NumiAgent accounts. You can remove your address using the link in the confirmation email. Unconfirmed requests expire after 24 hours. Confirmed entries are kept for up to one year.'
      ]},
      {title:'Access, export, and deletion',paragraphs:[
        'The app excludes its guest collection folder from automatic device backups. You can export a separate encrypted backup and choose where to save it, including iCloud Drive if you use it. Keep the recovery key separately. A spreadsheet export includes private fields only when you choose that option.',
        'Keep your collection in NumiAgent as long as you need it. Settings lets you export your records, revoke sessions, and request deletion. Use Developer access to revoke API keys and connected agents. Deletion disables access and queues removal of private records and photographs. Backup and operational copies may expire on their own schedules.'
      ],links:[{href:'/app#settings',label:'Manage your account'},contact]},
      {title:'Questions about your data',paragraphs:[
        'Use the contact form for privacy questions, to correct information, or to ask about a record you cannot manage through Settings.'
      ],links:[contact]}
    ]
  },
  '/help':{
    label:'Help',title:'Collector guide',
    description:'Get started with a collection, import photographs, and understand what the catalog is showing you.',
    sections:[
      {title:'Start with an empty collection',paragraphs:[
        'Tap Start scanning on iPhone or iPad to save guest photos and records on your device. Choose Search online to send selected photos for identification. If you lose your connection, your draft is saved and you can retry after reconnecting.',
        'To use a separate web collection, open Privacy & browser access from the native Collection menu and choose Open web account. You can sign in with email in the browser and import a new batch there.'
      ],links:[app]},
      {title:'Import and review a batch',paragraphs:[
        'Use the photo library or phone camera. Choose whether to allow AI analysis. Open a processed photo to check the suggested attribution, adjust the crop, and pair another photo as the reverse. Save only the specimens you have reviewed.'
      ],links:[{href:'/app#imports',label:'Open photo imports'}]},
      {title:'Read a valuation',paragraphs:[
        'Open a specimen and add realized sales from original lot pages. Record the currency and whether each price includes the buyer’s premium. If the app shows Insufficient market evidence, it has too few comparable sales for that estimate.'
      ]},
      {title:'Find missing pieces and manage access',paragraphs:[
        'Themes show which checklist entries you own. Open a missing entry to search configured sources. Use Settings to export your records or delete your account. Manage agents and API keys under Developer.'
      ],links:[{href:'/app#themes',label:'Open themes'},{href:'/app#settings',label:'Open settings'},developerAccess]},
      {title:'Trouble signing in?',paragraphs:[
        'Use the most recent sign-in email from login@numiagent.com. A link can be used once and expires after 10 minutes. Check your spam folder if the email does not arrive.'
      ],links:[contact]}
    ]
  },
  '/contact':{
    label:'Contact',title:'Contact NumiAgent',
    description:'Ask about your account, report an issue, or get help with a collection or privacy request.',
    sections:[
      {title:'Before you send',paragraphs:[
        'Include the email where you can receive a reply and the steps that led to the issue. Leave out passwords, sign-in links, and payment details.'
      ],links:[{href:'/privacy',label:'How we handle support messages'}]}
    ]
  },
  '/developers':{
    label:'Developers',title:'NumiAgent for developers',
    description:'Use the live REST API in your own scripts or connect an MCP client to your private collection.',
    sections:[
      {title:'Developer access',paragraphs:[
        'Sign in with your NumiAgent email and open Developer. From there you can issue read-only API keys and review or revoke MCP connections. Your integrations use the same collection you see in the web app.'
      ],links:[accessGuide,developerAccess]},
      {title:'REST API',paragraphs:[
        'Search 70,587 public coin and banknote references, query your collection, inspect photo imports, read valuation evidence and view collecting goals. Use the REST guide to send your first authenticated request.'
      ],links:[apiGuide,openApi]},
      {title:'Remote MCP server',paragraphs:[
        'Connect a Streamable HTTP MCP client and approve access in your browser. Tools can search your catalog, check theme gaps, return valuation evidence and query configured marketplace sources.'
      ],links:[mcpGuide]}
    ]
  },
  '/developers/api':{
    label:'REST API',title:'REST API guide',
    description:'Authenticate a script, query your NumiAgent collection, and see which endpoints accept API keys.',
    sections:[
      {title:'Create an API key',paragraphs:[
        `Open Developer, name your integration and choose Create read-only key. Copy the key when it appears and store it as a secret. A key expires after ${developerKeyLifespanDays} days and can be revoked from the same screen.`
      ],links:[accessGuide,developerAccess]},
      {title:'Make your first request',paragraphs:[
        'Set NUMIAGENT_API_KEY in your environment. Send it in the Authorization header with the Bearer scheme. For an unauthenticated health check, use GET /api/v1/health.'
      ],code:'curl -fsS -H "Authorization: Bearer $NUMIAGENT_API_KEY" "https://numiagent.com/api/v1/items?q=Trajan&page=0"'},
      {title:'Read the collection',paragraphs:[
        'API keys can read collection folders, specimens and counts, import status, private photos and identification candidates, themes and missing slots, saved watchlists, valuations and their history, references, and marketplace search coverage.',
        'OpenAPI marks key-enabled operations with developerKey. Account management, bulk exports and changes to the catalog use the signed-in browser session.'
      ],links:[openApi]},
      {title:'Search the reference catalog',paragraphs:[
        'GET /api/v1/catalog lists the current release, source credits, licenses, and downloads. Use your developer key to search /api/v1/catalog/search by title, issuer, denomination, year, or reference. Pass kind=coin or kind=banknote to narrow results. Start at page 0 and follow nextPage. Use /api/v1/catalog/entries/{id} to retrieve a record by its stable catalog ID.'
      ],code:'curl -fsS -H "Authorization: Bearer $NUMIAGENT_API_KEY" "https://numiagent.com/api/v1/catalog/search?q=Trajan%20denarius&kind=coin"',
        links:[{href:'/api/v1/catalog',label:'Catalog release and source downloads'},openApi]},
      {title:'Page through results',paragraphs:[
        'GET /api/v1/items accepts q, page, type, collection, and sort. Start at page 0 and use next from each response until it is null. Use the item id to request a specimen or its valuation. Photo endpoints stream the original stored image or return identification status as JSON, depending on the path.'
      ]},
      {title:'Handle errors and limits',paragraphs:[
        `A 401 means the key is missing, invalid, expired, or revoked. A 403 means the operation requires a browser session. A 404 means the resource is unavailable to this account. API keys share ${developerRequestLimit} requests per minute per account. Wait before retrying a 429 response. Marketplace queries also count toward the account’s marketplace quota.`
      ],links:[{href:'/developers',label:'Developer overview'},contact]}
    ]
  },
  '/developers/mcp':{
    label:'MCP',title:'MCP connection guide',
    description:'Connect a remote Model Context Protocol client to the live NumiAgent server and grant read-only access.',
    sections:[
      {title:'Connect your client',paragraphs:[
        'Add a remote Streamable HTTP server in a client that supports browser OAuth and dynamic client registration. Enter the URL below. Start the connection, sign in to NumiAgent, review the client and its redirect destination, then approve collection access.',
        'The client discovers OAuth settings automatically and uses authorization code with S256 PKCE. If the email sign-in opens in another browser, reopen the client’s authorization link in the browser where you signed in.'
      ],code:'https://numiagent.com/mcp',links:[{href:'/.well-known/oauth-protected-resource/mcp',label:'OAuth discovery metadata'}]},
      {title:'MCP protocol reference',paragraphs:[
        'NumiAgent serves MCP over stateless Streamable HTTP at /mcp. After OAuth, the client sends the access token in the Authorization header, sends initialize, and calls tools/list to retrieve the current tool input schemas. Call tools/call with a tool name and its arguments. Tools return structuredContent.data alongside a text representation. Entries such as unavailable marketplace coverage and insufficient valuation evidence appear in the returned data.',
        'The OAuth server publishes its issuer, authorization and token endpoints, registration endpoint, and PKCE support in its discovery document. Use an MCP OAuth token for this endpoint and a NumiAgent API key for supported REST operations.'
      ],links:[{href:'/developers/mcp/server.json',label:'MCP server manifest'},{href:'/.well-known/oauth-authorization-server',label:'OAuth server metadata'},
        {href:'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports',label:'Streamable HTTP specification'}]},
      {title:'Tools and results',paragraphs:[
        'Tools return structured results. Use search_catalog to find public reference entries and get_catalog_entry to read their source and license. Use search_my_collection for your saved specimens or get_collection_statistics for specimen and photo counts. identify_coin_or_banknote reads candidate results for an existing upload. Marketplace tools report unavailable coverage when a source cannot provide current lots.'
      ],code:[
        'search_catalog                q, kind?, limit?, page?',
        'get_catalog_entry             id',
        'search_my_collection          query?, type?, page?',
        'get_collection_item           itemId',
        'get_collection_statistics     {}',
        'list_my_themes                {}',
        'get_missing_items             themeId',
        'identify_coin_or_banknote     photoId',
        'get_valuation                 itemId, currency?',
        'get_recent_sales              itemId',
        'search_market                 query',
        'find_missing_items_for_sale   themeId, label'
      ].join('\n')},
      {title:'Review and revoke access',paragraphs:[
        'The collection:read scope lets an authorized agent read your collection, notes, valuation evidence and themes. Marketplace tools send query terms to configured providers. To disconnect a client, open Developer and choose Revoke client.'
      ],links:[developerAccess,{href:'/developers',label:'Developer overview'},apiGuide]}
    ]
  },
  '/developers/access':{
    label:'API access',title:'API and MCP access',
    description:'Sign in to NumiAgent to create and manage REST API keys or approve and revoke MCP connections for your private collection.',
    sections:[
      {title:'Open your developer workspace',paragraphs:[
        'Sign in with your NumiAgent email. Your account opens the Developer workspace, where you manage access to the same collection you see in the catalog. New users can create an account through the email sign-in flow.'
      ],links:[developerAccess]},
      {title:'Create a key for a script or service',paragraphs:[
        `In Developer, give the integration a name and choose Create read-only key. Copy the secret as soon as it appears and store it in your application's secret store. Send it as a Bearer token for supported REST reads. The key expires after ${developerKeyLifespanDays} days. To rotate a key, create its replacement, update your integration, then revoke the old key.`
      ],links:[apiGuide,openApi]},
      {title:'Authorize an MCP client',paragraphs:[
        'Add https://numiagent.com/mcp in your MCP client. Begin its OAuth flow, sign in, and review the client name, destination, and requested access before approving. Manage or revoke connected clients from Developer at any time.'
      ],links:[mcpGuide]},
      {title:'Know what you are granting',paragraphs:[
        'Use read-only access with integrations you trust. API keys can read your catalog and private photographs. MCP clients can read records covered by collection:read and query configured marketplaces. Keep credentials out of public repositories, frontend code, and support messages.'
      ],links:[contact]}
    ]
  }
}
export const siteLinks = Object.entries(sitePages).filter(([href,page])=>!href.startsWith('/developers/') && !page.article)
  .map(([href,page])=>({href,label:page.label}))
