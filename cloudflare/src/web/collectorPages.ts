import type { SitePage } from './sitePages'
import { iosLandingPath } from './launch'

export const photoIdPath = '/identify-coin-from-photo'
export const banknoteAppPath = '/banknote-inventory-app'
export const toolsGuidePath = '/blog/best-numismatic-tools-and-iphone-apps'

const ios = {href:iosLandingPath,label:'See the iPhone and iPad app'}
const photoGuide = {href:'/blog/photograph-coins-and-banknotes',label:'How to photograph coins and banknotes'}
const tools = {href:toolsGuidePath,label:'Compare numismatic tools and iPhone apps'}

export const collectorPages:Record<string,SitePage> = {
  [iosLandingPath]:{
    label:'iPhone & iPad',title:'Coin collection app for iPhone and iPad',
    seoTitle:'Coin Collection App for iPhone | NumiAgent',
    description:'Scan coins and banknotes, keep both photos with one record, and search your collection on iPhone or iPad, even offline.',
    launchActions:true,
    image:{path:'/launch-media/iphone-collection.jpg',alt:'The NumiAgent iPhone collection list with two coins and a banknote'},
    sections:[
      {title:'Catalog the tray while it’s in front of you',paragraphs:[
        'Start scanning without an email. Take photos or add them from your library in either order. Each piece can have two sides under one record. Your photos and unfinished pieces are saved on the device so you can pick them up later.',
        'When the app has a useful suggestion, it fills in details for you to review. Correct a year or denomination before saving or keep a provisional record to research later.'
      ],links:[{href:photoIdPath,label:'Identify a coin from a photo'},photoGuide]},
      {title:'Find the record when you need it',paragraphs:[
        'Search the collection by the details you entered. Keep an unfamiliar piece alongside the ones you know, and pull up both images when you want to check a date, legend, or variety. The iPad layout puts the collection and the specimen side by side.'
      ],links:[{href:banknoteAppPath,label:'Organize a banknote collection'},{href:'/blog/start-a-digital-coin-catalog',label:'Set up a digital coin inventory'}]},
      {title:'Keep a backup you control',paragraphs:[
        'Export an encrypted backup and save the recovery key separately. If you want a spreadsheet, export a CSV and choose whether to include private fields. You can open a separate web account with email sign-in. Your on-device records stay on the device when you sign in.'
      ],links:[{href:'/privacy',label:'How NumiAgent handles your data'},tools]}
    ]
  },
  [photoIdPath]:{
    label:'Coin photo identification',title:'Identify a coin from a photo',
    seoTitle:'Identify a Coin From a Photo | NumiAgent',
    description:'Use both sides of an unfamiliar coin to review possible matches, check the visible details, and save what you find.',
    launchActions:true,
    image:{path:'/launch-media/iphone-identification.jpg',alt:'The NumiAgent iPhone photo identification screen'},
    sections:[
      {title:'Give the app two clear views',paragraphs:[
        'Put the coin on a plain surface and use soft light from one side. Photograph the full edge and design on both faces. If the date, mint mark, or inscription is faint, take a close-up you can compare with the full image. Add the two main photos to the same piece in NumiAgent.'
      ],links:[photoGuide]},
      {title:'Check the details that distinguish look-alikes',paragraphs:[
        'On-device recognition reads visible clues and can suggest a match or a group of possible matches. Check the denomination, issuer, year, mint mark and inscriptions against the actual piece. Some ancient coins need the portrait, reverse design, weight and diameter to distinguish related types.',
        'If the suggestion is broad, keep what you can verify and leave the precise variety open. You can tap Search online and choose to send the piece’s photos for a second opinion.'
      ],links:[{href:'/blog/identify-roman-coins',label:'Identify a Roman coin from its legend and mint mark'},{href:'/api/v1/catalog',label:'See the reference catalog coverage'}]},
      {title:'Save the evidence with the identification',paragraphs:[
        'Keep both photos, the attribution you settled on, and the source that supports it under one searchable record. When you compare prices later, use sold lots for the same type and condition.'
      ],links:[ios,{href:'/blog/compare-coin-auction-prices',label:'Compare realized auction prices'},tools]}
    ]
  },
  [banknoteAppPath]:{
    label:'Banknote inventory',title:'Banknote inventory app for iPhone and iPad',
    seoTitle:'Banknote Inventory App for iPhone | NumiAgent',
    description:'Photograph your paper money collection, keep the front and back together, and export an inventory you control.',
    launchActions:true,
    image:{path:'/launch-media/ipad-collection.jpg',alt:'The NumiAgent iPad collection and specimen shown side by side'},
    sections:[
      {title:'Give each note one searchable record',paragraphs:[
        'Photograph both sides with all four corners visible. Save the issuer, denomination and date or series with the images. Add a catalog reference when you have one. Keep similar notes as separate records so each physical note retains its own photos and history.'
      ],links:[{href:'/blog/catalog-banknote-collection',label:'How to catalog a paper money collection'},photoGuide]},
      {title:'Read the note and check the issue',paragraphs:[
        'NumiAgent can use visible wording to suggest an issuer, denomination, or date. Match the actual series, design and signatures against a reference when two issues look similar. If a series is unclear, save the fields you can verify and come back to it.'
      ],links:[{href:'/features#identification',label:'How photo identification works'}]},
      {title:'Bring a copy of the inventory with you',paragraphs:[
        'Keep the guest collection on your iPhone or iPad. Use an encrypted backup to preserve both photos and drafts, or export a CSV for a spreadsheet. You choose whether to include private fields. If you collect coins as well, both types can live in the same collection.'
      ],links:[ios,{href:'/privacy',label:'Read the privacy policy'},tools]}
    ]
  }
}
