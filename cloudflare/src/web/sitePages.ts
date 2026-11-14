export const brand = 'NumiAgent'
export const canonicalOrigin = 'https://numiagent.com'

type Link = {href:string;label:string}
type Section = {title:string;paragraphs:string[];links?:Link[]}
export type SitePage = {
  label:string
  title:string
  description:string
  sections:Section[]
  effective?:string
}

const contact = {href:'/contact',label:'Contact NumiAgent'}
const help = {href:'/help',label:'Read the collector guide'}
const app = {href:'/app',label:'Open your collection'}

export const sitePages:Record<string,SitePage> = {
  '/about':{
    label:'About',title:'About NumiAgent',
    description:'NumiAgent is a private workspace for collecting coins and banknotes, from the first photograph to a source-linked catalog.',
    sections:[
      {title:'From the tray to the catalog',paragraphs:[
        'Bring photographs of coins and banknotes into one catalog. Import a batch, pair the two sides, and review candidate identifications before saving a specimen.'
      ]},
      {title:'Keep the evidence with the piece',paragraphs:[
        'Record attributions, catalog references, provenance, and realized auction sales. A valuation range appears when there are enough comparable records. Each sale can be traced to its original lot.'
      ]},
      {title:'Collect toward a goal',paragraphs:[
        'Build a checklist for an emperor, a series, or a theme of your own. See what you already have and search configured auction sources for missing pieces.'
      ],links:[help,app]},
      {title:'Reference data',paragraphs:[
        'Selected ruler, mint, denomination, and metal terms link to Nomisma.org. Individual reference results retain their source and attribution.'
      ],links:[{href:'https://www.nomisma.org/',label:'Nomisma.org'}]}
    ]
  },
  '/terms':{
    label:'Terms',title:'Terms of Service',effective:'November 14, 2026',
    description:'The terms that apply when you use the NumiAgent website, catalog, APIs, and connected tools.',
    sections:[
      {title:'Your account',paragraphs:[
        'Keep control of the email address used to sign in. Sign-in links are for your use. You can revoke sessions and connected tools in Settings.'
      ]},
      {title:'Your collection and uploads',paragraphs:[
        'You retain ownership of your photographs and collection records. Upload material you have permission to use. You authorize NumiAgent to store and process that material to provide the features you use. AI analysis follows the consent choice you make for a photo batch.'
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
    label:'Privacy',title:'Privacy Policy',effective:'November 14, 2026',
    description:'How NumiAgent handles account information, photographs, collection records, and support messages.',
    sections:[
      {title:'Information used to run your account',paragraphs:[
        'We use your email address to sign you in and manage your account. A session cookie keeps you signed in. We record limited usage and security information to protect the service and enforce usage limits.'
      ]},
      {title:'Photographs and collection records',paragraphs:[
        'Your uploaded photographs and catalog are private to your account. When you consent to AI analysis for a batch, Cloudflare Workers AI processes the photographs for identification suggestions. You can also catalog them manually.'
      ]},
      {title:'Services and connected tools',paragraphs:[
        'Cloudflare hosts the site, stores the app data, checks for spam and abuse, and delivers sign-in email. Your browser requests the site typefaces from Google Fonts. If you run a marketplace search, the query may be sent to configured providers. A connected agent can read the records covered by the permissions you approve in its authorization screen.'
      ]},
      {title:'Support requests',paragraphs:[
        'The contact form stores your reply email, topic, and message so the operator can review and respond. Contact messages are scheduled for deletion from the active inbox after 90 days. Omit payment details, sign-in links, and other sensitive information.'
      ]},
      {title:'Access, export, and deletion',paragraphs:[
        'Keep your collection in NumiAgent as long as you need it. Settings lets you export your records, revoke sessions and connected agents, and request deletion. Deletion disables access and queues removal of private records and photographs. Backup and operational copies may expire on their own schedules.'
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
        'Open your collection and choose Import photos to work through a batch, or use Add specimen to enter a coin or banknote by hand. Counts on the overview reflect what you have actually saved.'
      ],links:[app]},
      {title:'Import and review a batch',paragraphs:[
        'Use the photo library or phone camera. Choose whether to allow AI analysis. Open a processed photo to check the suggested attribution, adjust the crop, and pair another photo as the reverse. Save only the specimens you have reviewed.'
      ],links:[{href:'/app#imports',label:'Open photo imports'}]},
      {title:'Read a valuation',paragraphs:[
        'Open a specimen and add realized sales from original lot pages. Record the currency and whether each price includes the buyer’s premium. If the app shows Insufficient market evidence, it has too few comparable sales for that estimate.'
      ]},
      {title:'Find missing pieces and manage access',paragraphs:[
        'Themes show which checklist entries you own. Open a missing entry to search configured sources. In Settings you can export your records, revoke an agent’s access, or delete your account.'
      ],links:[{href:'/app#themes',label:'Open themes'},{href:'/app#settings',label:'Open settings'}]},
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
  }
}
export const siteLinks = Object.entries(sitePages).map(([href,page])=>({href,label:page.label}))
