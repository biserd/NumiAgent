import type { SitePage } from './sitePages'

const published = '2026-11-14'
const updated = '2026-11-15'
const photography = '/blog/photograph-coins-and-banknotes'
const catalog = '/blog/start-a-digital-coin-catalog'
const auctionPrices = '/blog/compare-coin-auction-prices'
const checklist = '/blog/build-a-roman-emperor-coin-checklist'
const romanCoins = '/blog/identify-roman-coins'
const banknotes = '/blog/catalog-banknote-collection'
export const blogDate = (date:string) => new Intl.DateTimeFormat('en-US',{
  dateStyle:'long',timeZone:'UTC'
}).format(new Date(date))

type Post = SitePage & {path:string;guideLabel:string;article:NonNullable<SitePage['article']>}
export const blogPosts:Post[] = [
  {
    path:photography,
    guideLabel:'Coin and banknote photography',
    seoTitle:'How to Photograph Coins and Banknotes | NumiAgent',
    label:'Photography',title:'How to photograph coins and banknotes for your catalog',
    article:{topic:'Photography',published,updated,related:[catalog,romanCoins]},
    description:'Capture both sides, keep inscriptions readable, and process a batch without losing track of which images belong together.',
    sections:[
      {title:'Set up once for the whole batch',paragraphs:[
        'Use a plain, matte background and a steady phone or camera. Start with one diffused light from the side. Move the light until the legend and relief are both readable, then take a test shot and check it at full size. A slight change in the angle of the light can help with a worn inscription. Reposition the light before tilting the coin or camera.',
        'Choose a background that separates the edges of the object from the surface underneath. With banknotes, keep the camera square to the paper and include all four corners. If a note is fragile, put it on a clean support and photograph it as it sits. Keep holders in place when they are doing a better job of protecting the item than a new photo would justify.',
        {before:'Before you start a large batch, decide how you’ll ',link:{href:'/features#photo-imports',label:'import and organize your coin photos'},after:' so the naming and shooting order fit the way you’ll review them.'}
      ]},
      {title:'Photograph the sides in a consistent order',paragraphs:[
        'Take the obverse and reverse one after the other, then move to the next piece. When an edge inscription, watermark or mint mark matters, take a third detail shot. Keep the full view alongside the close-up so the mark has a location.',
        'For coins out of their holders, handle them by the edge. A small tray lined with a soft, clean material helps keep pieces from rolling or touching while you work.',
        {before:'If you’re trying to ',link:{href:romanCoins,label:'identify a Roman coin'},after:', take a close-up of the letters around the rim and the space just below the reverse design.'}
      ],links:[{href:'https://www.canada.ca/en/conservation-institute/services/conservation-preservation-publications/canadian-conservation-institute-notes/care-coins-medals-medallic-art.html',label:'Canadian Conservation Institute guide to coin handling'}]},
      {title:'Make a faithful record before you take detail shots',paragraphs:[
        'Give each piece a complete front and back photograph under the same light. If a low angle helps reveal an inscription or a light behind a note shows a watermark, keep those as separately labeled detail views. Photograph a ruler or a neutral reference next to the piece in an additional frame if dimensions or color matter to the identification. Leave a small margin so you can see clipped edges and irregular flan shapes.',
        'The Federal Agencies Digital Guidelines Initiative discusses faithful reproduction, retaining edges, and avoiding enhancements that change the appearance of a documentary image. For a home catalog, a practical version is to keep an unedited original, label edited crops, and turn off beauty filters, automatic background removal, and aggressive sharpening. Zoom in after the shot to check that thin lettering survived rather than trying to fix it later.'
      ],links:[{href:'https://www.digitizationguidelines.gov/guidelines/digitize-technical.html',label:'FADGI technical guidelines for digitizing cultural heritage materials'}]},
      {title:'Troubleshoot glare, blur, and cropped details',paragraphs:[
        'If reflective areas hide an inscription, move a large diffused light a little farther from the camera axis and compare a second exposure. With a slab, shift the reflection out of the lettering while keeping the camera aligned with the coin. If one edge of a banknote is softer than the other, check that the camera and supporting surface are parallel. Tap to focus on the object and take the photo with a timer if pressing the shutter moves the phone.',
        'Before moving on to a new setup, check one copper coin, one reflective coin, or one detailed banknote from the actual batch. Legible marks at full size matter more to later research than how crisp the thumbnail looks.'
      ]},
      {title:'Review before you save',paragraphs:[
        'For a batch of 25 coins, assign IDs such as TRAY1-001 through TRAY1-025 and use matching file names such as TRAY1-001-obv.jpg and TRAY1-001-rev.jpg. Start a new number even when two pieces look identical. Keep the same ID if you retake a photo.',
        'Give the import batch a name you’ll recognize later. Check each suggested crop against the full photograph for clipped borders or missing legends. Pair the two sides and mark an uncertain attribution in your notes. If two similar pieces are in the same tray, compare their edges and surface marks before linking the reverse.',
        {before:'After you ',link:{href:catalog,label:'set up your digital catalog'},after:', reopen a few saved records and check that both views belong to the same piece before the tray goes back into storage.'}
      ],links:[{href:'/app#imports',label:'Open photo imports'}]}
    ]
  },
  {
    path:catalog,
    guideLabel:'Digital coin catalog',
    seoTitle:'How to Catalog a Coin Collection | NumiAgent',
    label:'Cataloging',title:'How to start a digital coin and banknote catalog',
    article:{topic:'Cataloging',published,updated,related:[photography,banknotes]},
    description:'Build a digital coin collection inventory with fields for photos, references, provenance, condition, and purchase records you can search and export.',
    sections:[
      {title:'Start with a small representative batch',paragraphs:[
        'Pick one tray, folder, or envelope and add a few pieces that show the range of your collection. Include something easy to identify and something that needs research. That will tell you which fields you actually use before you spend an afternoon entering data.',
        'Start with a short title, denomination, issuer, approximate date and both sides. Add a catalog reference when you have one. For a coin, weight and diameter can help when the type is hard to distinguish. For a banknote, a series designation, issuer and signatures can be more useful than a long description of the design.',
        {before:'Use the same fields in a spreadsheet or in a ',link:{href:'/features#catalog',label:'searchable private collection catalog'},after:'. Try filtering the sample by issuer and finding an item using only its ID before you add the rest.'}
      ]},
      {title:'Give observations and attributions their own place',paragraphs:[
        'Write down what you can see, including the visible letters, measurements, or identifying marks. In the attribution fields, record the identification those observations support. If part of the inscription is unclear, preserve what you can read and explain the uncertainty in notes. Give the source enough detail that you or another collector could follow it again.',
        'Treat the specimen in front of you as its own record. Two pieces can share the same catalog reference and still have different acquisition dates, grades, photographs, and provenance.',
        {before:'Use a consistent naming convention when you ',link:{href:photography,label:'photograph items for your inventory'},after:' so each photograph can be traced to the physical item and its catalog record.'}
      ]},
      {title:'Keep specimen IDs separate from catalog references',paragraphs:[
        'Classical Numismatic Group cataloged a Trajan denarius as lot 472 in Electronic Auction 477 and identified its type as RIC II 189. The auction and lot number identify the sale record for that specimen. The RIC reference identifies a type shared by other specimens. Assign an inventory ID you control and give the type reference and the original lot link separate fields.',
        {before:'The Bank of Canada Museum identifies its 1935 Canadian Bank of Commerce five-dollar note as object 1962.27.36. Its denomination, date, and issuer are separate pieces of information. When you ',link:{href:banknotes,label:'catalog a banknote collection'},after:', preserve the series, signatures, and serial number in separate fields too.'}
      ],links:[
        {href:'https://cngcoins.com/Lot.aspx?LOT_ID=20409',label:'CNG lot record for a Trajan denarius'},
        {href:'https://www.bankofcanadamuseum.ca/explore/collections/about-the-collection/',label:'Bank of Canada Museum collection records'}
      ]},
      {title:'Set up a row you can reuse',paragraphs:[
        'In a spreadsheet or an exported CSV, keep quantities and units in the header or in clearly named fields, such as weight_g and diameter_mm. Keep the catalog edition with the reference when a numbering series has changed. Give the acquisition source, date, price and currency separate fields so you can read those values later without interpreting a free-form note.',
        'Record grades the way the source gave them, including whether the description came from you, a dealer, or a certification service. For provenance, save the seller or prior owner as documented, acquisition date, and a receipt or catalog reference you can find again.',
        'For a first spreadsheet row, use columns for Item ID, Issuer, Denomination, Date, Reference, Weight (g), Diameter (mm), Grade and source, Acquisition date, Purchase price, Currency, and Photo IDs. The American Numismatic Association also publishes an inventory spreadsheet you can adapt.'
      ],links:[{href:'https://www.money.org/inserts-spreadsheet/',label:'American Numismatic Association inventory spreadsheet'}]},
      {title:'Keep the catalog easy to search and take with you',paragraphs:[
        'Use the same spelling for fields you filter on, such as mint or ruler. Use folders for groups you work with regularly and themes for checklists that cut across those groups. For instance, an emperor checklist might span two albums and a tray of duplicates.',
        'If you’re transferring old records, compare a sample against the photographs and receipts before accepting the whole batch. Export a CSV after a major update and check a few records in the file, including any notes or purchase details that would be hard to reconstruct.'
      ],links:[{href:'/app#collection',label:'Open the collection'},{href:checklist,label:'Build a Roman emperor checklist'}]}
    ]
  },
  {
    path:auctionPrices,
    guideLabel:'Coin auction prices realized',
    seoTitle:'Compare Coin Auction Prices Realized | NumiAgent',
    label:'Valuation',title:'How to compare coin auction prices using sold lots',
    article:{topic:'Valuation',published,updated,related:[catalog,romanCoins]},
    description:'Compare coin auction prices realized using sold lots, exact type references, condition, hammer prices, buyer’s premiums, and original currencies.',
    sections:[
      {title:'Start with the actual sale',paragraphs:[
        'Look for a published result tied to an original lot page. Save the auction house, lot number, date, price, and currency together. A dealer’s asking price or an opening bid can tell you what someone offered the piece for. It can’t tell you what a buyer paid.',
        'When the lot includes several pieces, keep it separate from sales of individual coins. Splitting the price evenly across a group assumes that every piece contributed the same value.',
        {before:'Keep the original lot link with the ',link:{href:'/features#valuation',label:'comparable sales in your catalog'},after:' so you can check what sold and which charges were included.'}
      ]},
      {title:'Compare the things that drove the price',paragraphs:[
        'Match the type, denomination, metal, and reference first. Then compare condition, strike, centering, surface issues, and the legibility of the design. Two coins that share a reference can draw very different bids. A documented pedigree can matter too, especially if it is unusual for that type.',
        'Save a few relevant results across different sales. If one result sits far apart, record the reason you included it or kept it out. An old result or a grade mismatch can still be useful context when it’s clearly labeled.',
        {before:'For an ancient imperial coin with an uncertain reverse, ',link:{href:romanCoins,label:'verify the Roman coin type'},after:' before using an exact-reference sale to estimate its value.'}
      ]},
      {title:'Worked example using two published Trajan denarius sales',paragraphs:[
        'Classical Numismatic Group reported a USD 475 hammer for Electronic Auction 477, lot 472, on September 23, 2020. The lot was RIC II 189, a Rome-mint Trajan denarius with seated Pax and a kneeling figure, cataloged as Good VF. The lot states an 18% buyer’s fee. Applying that fee gives USD 560.50 before any taxes, shipping, or other charges.',
        'Electronic Auction 615, lot 654, sold for a USD 275 hammer on August 12, 2026. This Rome-mint Trajan denarius was RIC II 293 with Trajan’s Column, cataloged as Near VF with scratches. At the 20% fee stated for that auction, the price including premium was USD 330 before other charges.',
        'Both records belong in a broad Trajan denarius search. For a valuation, keep them in separate groups by reference and use each as context until you find additional sales of the same type and similar condition. The dates are also far apart. These two observations alone cannot isolate the effect of the reverse type or condition on the price.'
      ],links:[
        {href:'https://cngcoins.com/Lot.aspx?LOT_ID=20409',label:'CNG Electronic Auction 477, lot 472'},
        {href:'https://www.cngcoins.com/Lot.aspx?LOT_ID=204793',label:'CNG Electronic Auction 615, lot 654'}
      ]},
      {title:'Put the prices on the same basis',paragraphs:[
        'Check whether the result is the hammer price or includes the buyer’s premium. For example, a hypothetical $100 hammer with a 20% premium is $120 before tax and shipping. Check the terms for the specific auction when the result page doesn’t say how the price was recorded.',
        'Keep the original currency and sale date. If you convert currencies, record the rate, its date, and its source as well. The European Central Bank publishes euro reference rates for information. Treat these as a consistent research conversion and keep an actual card or dealer exchange rate separately when you know it.'
      ],links:[{href:'https://auctions.cngcoins.com/conditions-of-sale',label:'Classical Numismatic Group conditions of sale'},{href:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',label:'European Central Bank reference exchange rates'}]},
      {title:'Keep purchase cost and valuation evidence separate',paragraphs:[
        {before:'When you ',link:{href:catalog,label:'catalog your collection'},after:', give your acquisition cost its own field. Store later sales as comparables with the original date and currency and a note about why they match.'},
        'If you can only find one similar result, record it as a single observation. A range based on several genuinely comparable sales will be easier to defend when another collector asks how you arrived at it.'
      ],links:[{href:'/help',label:'Record sale evidence in NumiAgent'}]}
    ]
  },
  {
    path:checklist,
    guideLabel:'Roman emperor coin checklist',
    seoTitle:'Roman Emperor Coin Checklist | NumiAgent',
    label:'Collecting goals',title:'How to build a Roman emperor coin checklist',
    article:{topic:'Collecting goals',published,updated,related:[romanCoins,auctionPrices]},
    description:'Set a scope for your Roman collection, define what counts as a match, and keep a source-backed record of the rulers you still need.',
    sections:[
      {title:'Decide what the set covers',paragraphs:[
        '“One coin per emperor” can mean a short run or a lifetime project. Pick a period or group you can describe in a sentence. Decide whether a coin needs to show the ruler, name them in the inscription, or simply have been issued under their authority. Write down how you’ll treat provincial issues, posthumous issues, and uncertain attributions.',
        {before:'Start with a ',link:{href:'/features#checklists',label:'first-century Roman emperor checklist'},after:' in NumiAgent and edit it to suit your goal. If you want only silver coins or a particular mint, write that into the rule so the checklist reflects the pieces you actually intend to collect.'}
      ]},
      {title:'Keep a reference with each slot',paragraphs:[
        'Record a name, a reference link, and any denomination or type requirement. Reigns and family names can make the same piece appear relevant to more than one slot. A stable ruler identifier and a note about why a specimen qualifies help you resolve that later.',
        'Nomisma gives numismatic concepts stable identifiers. Use it to keep the ruler or mint reference consistent, and keep the type reference on the specimen itself when you know it.',
        {before:'If you inherited a mixed lot, ',link:{href:romanCoins,label:'identify the Roman coins'},after:' one at a time before treating a ruler as covered or missing.'}
      ],links:[{href:'https://nomisma.org/',label:'Nomisma linked numismatic references'}]},
      {title:'Choose the reference that matches the kind of issue',paragraphs:[
        'Online Coins of the Roman Empire uses the Roman Imperial Coinage numbering system. It is a good place to verify imperial types and compare specimens held by different institutions. Roman Provincial Coinage Online covers civic and provincial coinage. When your checklist includes provincials, use the matching corpus and retain the full reference rather than putting both kinds of identifiers in an ambiguous numeric field.',
        'Keep a ruler’s authority separate from a person depicted on the coin. In OCRE’s RIC I second edition Augustus 208 record, Augustus is the authority and appears on the obverse. The reverse shows Gaius and Lucius Caesar. Under a checklist rule based on issuing authority, this fills an Augustus slot. A portrait or family theme could use a separate rule and match the reverse figures. Record which rule you used so the same decision can be applied across the collection.'
      ],links:[
        {href:'https://isaw.nyu.edu/publications/research-reference/ocre',label:'Institute for the Study of the Ancient World on OCRE'},
        {href:'https://rpc.ashmus.ox.ac.uk/',label:'Roman Provincial Coinage Online'},
        {href:'https://numismatics.org/ocre/id/ric.1%282%29.aug.208',label:'OCRE type record for RIC I Augustus 208'}
      ]},
      {title:'Give each gap a next step',paragraphs:[
        {before:'Check the owned entries before treating the gaps as a shopping list. Correct ambiguous records and decide whether an alternate type fits your rules. For each remaining gap, add a denomination or catalog reference before you ',link:{href:auctionPrices,label:'compare sold coin auction lots'},after:'.'},
        'Revisit the checklist after an acquisition or a correction. An updated attribution may fill a gap without needing another purchase, and a better photo can turn a tentative match into one you’re comfortable keeping.'
      ],links:[{href:'/app#themes',label:'Open themes in NumiAgent'}]}
    ]
  },
  {
    path:romanCoins,
    guideLabel:'Roman coin identification',
    seoTitle:'How to Identify a Roman Coin | NumiAgent',
    label:'Identification',title:'How to identify a Roman coin from its legend and mint mark',
    article:{topic:'Identification',published:updated,related:[photography,checklist]},
    description:'Identify a Roman coin step by step using both sides, visible inscriptions, the reverse design, mint marks, measurements, and catalog references.',
    sections:[
      {title:'Start with the evidence on the coin',paragraphs:[
        'Write down the letters you can read, describe the portrait and reverse design, and record the weight in grams and widest diameter in millimeters. Keep those observations with two photographs. Use a separate detail image for letters or marks that disappear in the full view.',
        {before:'For a worn or unfamiliar coin, ',link:{href:'/features#identification',label:'review AI identification candidates'},after:' if you want a starting point. Compare each candidate against the inscription, reverse, and measurements. If the evidence fits several types, keep the attribution provisional.'},
        {before:'If glare makes the design hard to read, ',link:{href:photography,label:'retake the obverse and reverse photos'},after:' in diffuse light and save the clearer view with the original.'}
      ]},
      {title:'Read the legend, then check the reverse',paragraphs:[
        'Start with the obverse legend, the inscription around the portrait. Transcribe letters in their order and mark gaps in your notes. Many imperial legends include abbreviated names and titles, and some titles recur across rulers. A short fragment such as AVG is rarely enough to identify an emperor on its own.',
        'Describe the reverse as carefully as you describe the portrait. Record whether the figure is standing or seated, which way it faces, and what it holds. On many later Roman issues, look below the main reverse design in the exergue and in the fields to either side. Copy the marks and where they appear before trying to expand them into a mint name.',
        'The Chartered Institute for Archaeologists’ recording toolkit treats the reverse type, reverse legend, and mint mark as separate fields. Keeping that distinction lets you compare your notes with a catalog even when part of the coin is illegible.'
      ],links:[{href:'https://www.archaeologists.net/work/toolkits/roman-coinage/glossary',label:'CIfA glossary for recording Roman coins'}]},
      {title:'Search the right Roman coin database',paragraphs:[
        'Use Online Coins of the Roman Empire (OCRE) for imperial types listed in Roman Imperial Coinage (RIC). Start with the ruler or denomination if you know it, then narrow by legend, mint, or reverse design. Compare photos of several examples when a portrait or letter is worn. Use Coinage of the Roman Republic Online for Republican issues and Roman Provincial Coinage Online for provincial issues.',
        'For a worked comparison, look at OCRE’s RIC I (second edition) Augustus 208. The ruler is Augustus, while the reverse shows Gaius and Lucius Caesar with shields and spears. A portrait that resembles Augustus is an initial clue. The figures and objects on the other side help test whether this specific candidate fits.'
      ],links:[
        {href:'https://numismatics.org/ocre/identify',label:'OCRE Roman imperial identification search'},
        {href:'https://numismatics.org/ocre/id/ric.1%282%29.aug.208',label:'OCRE type record for Augustus RIC I 208'},
        {href:'https://numismatics.org/crro/',label:'Coinage of the Roman Republic Online'},
        {href:'https://rpc.ashmus.ox.ac.uk/',label:'Roman Provincial Coinage Online'}
      ]},
      {title:'Write an attribution you can revisit',paragraphs:[
        'Keep the observed legend and measurements, the proposed issuer and type, the reference and edition, and the reason you accepted or rejected the match. If the mint letters are missing, record what remains readable and leave an exact mint-specific reference open. A type match helps identify the design and issue. Authentication calls for separate evidence.',
        {before:'Once the ruler is supported by the evidence, decide whether it fills a slot in your ',link:{href:checklist,label:'Roman emperor coin checklist'},after:'. Keep the same identification standard for coins already in the set and ones you’re considering buying.'}
      ]}
    ]
  },
  {
    path:banknotes,
    guideLabel:'Banknote collection inventory',
    seoTitle:'How to Catalog a Banknote Collection | NumiAgent',
    label:'Paper money',title:'How to catalog a banknote collection',
    article:{topic:'Paper money',published:updated,related:[catalog,photography]},
    description:'Build a paper money inventory that records denominations, issuers, series, signatures, serial numbers, condition, and photos of each note.',
    sections:[
      {title:'Give each banknote its own inventory record',paragraphs:[
        'Start with one envelope or album page. Record the country or territory, issuing authority, denomination and currency, series or issue, and a unique ID for each physical note. Take a photograph of the front and back and use the inventory ID in both filenames. If you own two notes of the same type, give each its own record.',
        {before:'A spreadsheet works for a small album. A ',link:{href:'/features#catalog',label:'private coin and banknote catalog'},after:' keeps photos alongside these fields and lets you filter or export the collection later.'},
        {before:'Use the same lighting and consistent filenames when you ',link:{href:photography,label:'photograph both sides of a banknote'},after:'. Take a separate detail photograph if a watermark or signature helps distinguish the issue.'}
      ]},
      {title:'Separate the series, serial number, and catalog reference',paragraphs:[
        'A series identifies an issue or design family. A serial number belongs to the individual note within the issuing system. Copy every leading zero, prefix, suffix, or symbol you can read and store it as text so a spreadsheet preserves it. Keep the printed series and any inferred year of issue in separate fields.',
        'A catalog reference identifies the type or variety according to a particular source. Save the catalog name or link along with the reference. Use a notes field for details such as language, signature combination, seal, printer, or watermark if they are relevant to the variety you’re recording. The U.S. Bureau of Engraving and Printing documents how serial number conventions vary by denomination and series.'
      ],links:[{href:'https://www.bep.gov/currency/serial-numbers',label:'Bureau of Engraving and Printing guide to serial numbers'}]},
      {title:'Use a museum record to check a variety',paragraphs:[
        'The Bank of Canada Museum’s 1935 first-series one-dollar note is a good example. It lists the denomination, design, printer, and signatures. The museum shows English and French versions of the note. In an inventory, record the language separately from the year and denomination so those versions stay distinguishable when you sort the sheet.',
        'Keep the museum page as the type reference and your photo as the record of the specimen you own. If you can read only one signature, write that down and leave the other open until you can verify it.'
      ],links:[{href:'https://www.bankofcanadamuseum.ca/complete-bank-note-series/1935-first-series/1-dollar/',label:'Bank of Canada Museum first-series one-dollar note'}]},
      {title:'Create a spreadsheet row you can use again',paragraphs:[
        'Start with Item ID, Issuer, Denomination, Currency, Series, Language, Serial number, Signatures, Reference, Condition, Acquisition date, Source, Cost, and Photo IDs. Note tears, folds, pinholes, and stains you can see. If a dealer or grading service supplied a grade, preserve their wording and record who supplied it.',
        {before:'If you already keep a ',link:{href:catalog,label:'digital coin collection inventory'},after:', reuse its acquisition, provenance, and photo fields. Keep note-specific fields separate so that a serial number never lands in a type-reference column.'},
        'Export a small batch and open the file before you catalog the rest. Check that serial numbers retain zeros, both photo names resolve to the same item, and a search by issuer or series returns the records you expect.'
      ],links:[{href:'/app#collection',label:'Open your collection'}]}
    ]
  }
]
