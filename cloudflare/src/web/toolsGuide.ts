import type { SitePage } from './sitePages'
import { banknoteAppPath, photoIdPath, toolsGuidePath } from './collectorPages'
import { iosLandingPath } from './launch'

const photography = '/blog/photograph-coins-and-banknotes'
const inventory = '/blog/start-a-digital-coin-catalog'
const auctionPrices = '/blog/compare-coin-auction-prices'
const banknotes = '/blog/catalog-banknote-collection'

export const toolsGuide = {
  path:toolsGuidePath,guideLabel:'Best numismatic tools and iPhone apps',
  seoTitle:'8 Best Numismatic Tools & iPhone Apps | NumiAgent',
  label:'Tools',title:'8 best numismatic tools and iPhone apps for collectors',
  description:'Compare iPhone apps and research tools for coin photo identification, banknote inventories, auction results, and private collecting.',
  article:{topic:'Tools',published:'2026-11-22',related:[photography,inventory,auctionPrices,banknotes]},
  image:{path:'/launch-media/iphone-collection.jpg',alt:'The NumiAgent iPhone app showing a demo coin and banknote collection'},
  launchActions:true,
  sections:[
    {title:'How we chose these tools',paragraphs:[
      'We make NumiAgent. It leads this guide for collectors who want to photograph coins and banknotes and keep their inventory on an iPhone or iPad. The other picks cover different jobs, from identifying a coin in the field to checking a realized price before bidding.',
      'We reviewed official product listings and documentation. We compared which items each tool covers, where it runs, what kind of reference or sale evidence it offers, and how collectors can keep and retrieve their records. The recommendations are based on documented workflows. We did not run a head-to-head accuracy test.'
    ],links:[{href:'/about',label:'About NumiAgent'}]},
    {title:'1. NumiAgent for a private coin and banknote collection',paragraphs:[
      'Start scanning on iPhone or iPad without an account. Add two sides in either order, review a suggestion, edit the details, and save one record for the piece. The collection and unfinished drafts stay on the device. The app can read visible clues offline and lets you choose to search online for a difficult piece.',
      {before:'Encrypted backup and CSV export give you a portable copy. The separate web catalog offers email sign-in, ',link:{href:'/features#valuation',label:'comparable-sale records'},after:', and checklist gaps. Automatic auction coverage is currently unavailable. For a valuation, bring trustworthy sold lots or use a specialist research tool alongside the catalog.'}
    ],links:[{href:iosLandingPath,label:'See NumiAgent on iPhone and iPad'},{href:banknoteAppPath,label:'Explore the banknote inventory app'}]},
    {title:'2. Coinoscope for visual coin search',paragraphs:[
      'Take a coin photo and review a list of visually similar coins. This can help when the alphabet or issuing country is unfamiliar. The developer also offers a saved collection and an option to inspect results in a desktop browser. Check the visible date and mint mark after you find a similar design.'
    ],links:[{href:'https://coinoscope.com/',label:'Coinoscope official features'},{href:photoIdPath,label:'How to identify a coin from a photo'}]},
    {title:'3. Maktun for scanning world coins and banknotes',paragraphs:[
      'Maktun offers mobile photo identification, a catalog for coins and banknotes, and collection lists. Its official site describes synchronization across devices and export options. Review the current plan to see which tools are included. For a note with several signatures or series variants, verify the exact issue against a reference after scanning.'
    ],links:[{href:'https://maktun.com/',label:'Maktun official product guide'}]},
    {title:'4. CoinSnap for an iPhone coin-scanning workflow',paragraphs:[
      'CoinSnap’s App Store listing describes coin scans, collection management, and value and condition estimates. It can be a quick starting point for sorting a pile of unfamiliar coins. Verify a tentative error attribution or high estimate with the actual feature, a reference, and comparable sales before making a purchase.'
    ],links:[{href:'https://apps.apple.com/us/app/coinsnap-coin-identifier/id1634551626',label:'CoinSnap on the App Store'}]},
    {title:'5. Numista for world coin and banknote references',paragraphs:[
      'Numista is a community-built online catalog with advanced filters, a collection inventory, and member swaps. Use the catalog to compare issuer, denomination, period, composition, and the visual details you can see. It works well as a reference alongside a collection you maintain separately.'
    ],links:[{href:'https://en.numista.com/',label:'Numista world coin and banknote catalog'}]},
    {title:'6. PCGS CoinFacts for U.S. coin research',paragraphs:[
      'PCGS combines its U.S. coin price guide with Photograde imagery, population reports, and auction prices realized. Use it after you know the issue. Write down the grading service and grade before comparing sale records, especially for pieces with a large price difference between adjacent grades.'
    ],links:[{href:'https://www.pcgs.com/apps',label:'PCGS CoinFacts and official mobile apps'}]},
    {title:'7. acsearch for historical auction records',paragraphs:[
      'Search historical auction descriptions when researching an ancient, medieval, or world coin. A good result points you back to the house, sale, and lot. Check whether the displayed figure is a realized price or an estimate and whether it includes the buyer’s premium. Some archive details require a subscription.'
    ],links:[{href:'https://www.acsearch.info/',label:'acsearch auction archive'},{href:auctionPrices,label:'How to compare realized auction prices'}]},
    {title:'8. OpenNumismat for a desktop inventory',paragraphs:[
      'OpenNumismat is an open-source desktop collection manager. Its published features include customizable catalog fields, image storage, filters, and import and export tools. It is a practical option for collectors who prefer to organize or edit a larger inventory at a computer.'
    ],links:[{href:'https://open-numismat.github.io/',label:'OpenNumismat official project site'}]},
    {title:'Try one ordinary piece and one difficult piece',paragraphs:[
      'Use a readable modern coin, a worn coin, and a banknote if you collect paper money. See whether the tool helps you record both sides, correct an uncertain date, and find the piece a week later. For a valuation, save the original lot link and compare like with like.'
    ],links:[{href:photography,label:'Photograph your first batch'},{href:inventory,label:'Build a digital collection inventory'},{href:banknotes,label:'Catalog a banknote collection'}]}
  ]
} satisfies SitePage & {path:string;guideLabel:string;article:NonNullable<SitePage['article']>}
