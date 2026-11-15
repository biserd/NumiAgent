import type { SitePage } from './sitePages'

const published = '2026-11-14'
export const blogDate = (date:string) => new Intl.DateTimeFormat('en-US',{
  dateStyle:'long',timeZone:'UTC'
}).format(new Date(date))

type Post = SitePage & {path:string;guideLabel:string;article:NonNullable<SitePage['article']>}
export const blogPosts:Post[] = [
  {
    path:'/blog/photograph-coins-and-banknotes',
    guideLabel:'Coin and banknote photography',
    seoTitle:'How to Photograph Coins and Banknotes | NumiAgent',
    label:'Photography',title:'How to photograph coins and banknotes for your catalog',
    article:{topic:'Photography',published},
    description:'Capture both sides, keep inscriptions readable, and process a batch without losing track of which images belong together.',
    sections:[
      {title:'Set up once for the whole batch',paragraphs:[
        'Use a plain, matte background and a steady phone or camera. Start with one diffused light from the side. Move the light until the legend and relief are both readable, then take a test shot and check it at full size. A slight change in the angle of the light can help with a worn inscription. Reposition the light before tilting the coin or camera.',
        'Choose a background that separates the edges of the object from the surface underneath. With banknotes, keep the camera square to the paper and include all four corners. If a note is fragile, put it on a clean support and photograph it as it sits. Keep holders in place when they are doing a better job of protecting the item than a new photo would justify.'
      ]},
      {title:'Photograph the sides in a consistent order',paragraphs:[
        'Take the obverse and reverse one after the other, then move to the next piece. When an edge inscription, watermark or mint mark matters, take a third detail shot. Keep the full view alongside the close-up so the mark has a location.',
        'For coins out of their holders, handle them by the edge. A small tray lined with a soft, clean material helps keep pieces from rolling or touching while you work.'
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
        'Give the import batch a name you’ll recognize later. Check each suggested crop against the full photograph for clipped borders or missing legends. Pair the two sides and mark an uncertain attribution in your notes. If two similar pieces are in the same tray, compare their edges and surface marks before linking the reverse.',
        'Once the collection record is saved, reopen it and make sure both views belong to the same piece. That quick check is easier today than it will be after the tray goes back into storage.'
      ],links:[{href:'/app#imports',label:'Open photo imports'},{href:'/blog/start-a-digital-coin-catalog',label:'Set up your catalog records'}]}
    ]
  },
  {
    path:'/blog/start-a-digital-coin-catalog',
    guideLabel:'Digital coin catalog',
    seoTitle:'Digital Coin Catalog Guide | NumiAgent',
    label:'Cataloging',title:'How to start a digital coin and banknote catalog',
    article:{topic:'Cataloging',published},
    description:'Choose the fields worth recording first, keep guesses separate from evidence, and build a catalog you can search and export.',
    sections:[
      {title:'Start with a small representative batch',paragraphs:[
        'Pick one tray, folder, or envelope and add a few pieces that show the range of your collection. Include something easy to identify and something that needs research. That will tell you which fields you actually use before you spend an afternoon entering data.',
        'Start with a short title, denomination, issuer, approximate date and both sides. Add a catalog reference when you have one. For a coin, weight and diameter can help when the type is hard to distinguish. For a banknote, a series designation, issuer and signatures can be more useful than a long description of the design.'
      ]},
      {title:'Give observations and attributions their own place',paragraphs:[
        'Write down what you can see, including the visible letters, measurements, or identifying marks. In the attribution fields, record the identification those observations support. If part of the inscription is unclear, preserve what you can read and explain the uncertainty in notes. Give the source enough detail that you or another collector could follow it again.',
        'Treat the specimen in front of you as its own record. Two pieces can share the same catalog reference and still have different acquisition dates, grades, photographs, and provenance.'
      ]},
      {title:'Use museum records to decide which fields belong in your catalog',paragraphs:[
        'The British Museum’s Augustus denarius R.6122 provides a useful model. R.6122 identifies one physical coin. Its record separately gives the authority, the observed weight of 3.79 g, a die axis of six o’clock, and a reference to RIC volume I, 167b. In your own inventory, assign an item identifier you control and keep the type reference in its own field. Another specimen can share the reference while having a different weight, surface, and ownership history.',
        'Use the same distinction for paper money. The museum’s 1935 five-dollar note has its own object number, 1984,0605.351, and distinct denomination and date fields. The Bank of Canada Museum identifies 1935 as the first series from the Bank of Canada. Preserve the exact wording for issuer and issue, then record the series, signature or serial number when it helps distinguish your particular note.'
      ],links:[
        {href:'https://www.britishmuseum.org/collection/object/C_R-6122',label:'British Museum object record for Augustus denarius R.6122'},
        {href:'https://www.britishmuseum.org/collection/object/C_1984-0605-351',label:'British Museum object record for a 1935 five-dollar banknote'},
        {href:'https://www.bankofcanadamuseum.ca/2020/11/understanding-money-common-questions/',label:'Bank of Canada Museum on the first 1935 series'}
      ]},
      {title:'Set up a row you can reuse',paragraphs:[
        'In a spreadsheet or an exported CSV, keep quantities and units in the header or in clearly named fields, such as weight_g and diameter_mm. Keep the catalog edition with the reference when a numbering series has changed. Give the acquisition source, date, price and currency separate fields so you can read those values later without interpreting a free-form note.',
        'Record grades the way the source gave them, including whether the description came from you, a dealer, or a certification service. A shortlist of clear, repeatable fields makes it easier to match auction results and build a checklist later.'
      ]},
      {title:'Keep the catalog easy to search and take with you',paragraphs:[
        'Use the same spelling for fields you filter on, such as mint or ruler. Use folders for groups you work with regularly and themes for checklists that cut across those groups. For instance, an emperor checklist might span two albums and a tray of duplicates.',
        'If you’re transferring old records, compare a sample against the photographs and receipts before accepting the whole batch. Export a CSV after a major update and check a few records in the file, including any notes or purchase details that would be hard to reconstruct.'
      ],links:[{href:'/features',label:'Explore NumiAgent’s catalog tools'},{href:'/blog/build-a-roman-emperor-coin-checklist',label:'Build a Roman emperor checklist'}]}
    ]
  },
  {
    path:'/blog/compare-coin-auction-prices',
    guideLabel:'Coin auction prices realized',
    seoTitle:'Compare Coin Auction Prices Realized | NumiAgent',
    label:'Valuation',title:'How to compare coin auction prices using sold lots',
    article:{topic:'Valuation',published},
    description:'Find sales that match your coin and compare the same price basis, with the date, original currency, and lot link attached.',
    sections:[
      {title:'Start with the actual sale',paragraphs:[
        'Look for a published result tied to an original lot page. Save the auction house, lot number, date, price, and currency together. A dealer’s asking price or an opening bid can tell you what someone offered the piece for. It can’t tell you what a buyer paid.',
        'When the lot includes several pieces, keep it separate from sales of individual coins. Splitting the price evenly across a group assumes that every piece contributed the same value.'
      ]},
      {title:'Compare the things that drove the price',paragraphs:[
        'Match the type, denomination, metal, and reference first. Then compare condition, strike, centering, surface issues, and the legibility of the design. Two coins that share a reference can draw very different bids. A documented pedigree can matter too, especially if it is unusual for that type.',
        'Save a few relevant results across different sales. If one result sits far apart, record the reason you included it or kept it out. An old result or a grade mismatch can still be useful context when it’s clearly labeled.'
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
      ],links:[{href:'https://auctions.cngcoins.com/conditions-of-sale',label:'Classical Numismatic Group conditions of sale'},{href:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',label:'European Central Bank reference exchange rates'},{href:'/help',label:'Record sale evidence in NumiAgent'}]}
    ]
  },
  {
    path:'/blog/build-a-roman-emperor-coin-checklist',
    guideLabel:'Roman emperor coin checklist',
    seoTitle:'Roman Emperor Coin Checklist | NumiAgent',
    label:'Collecting goals',title:'How to build a Roman emperor coin checklist',
    article:{topic:'Collecting goals',published},
    description:'Set a scope for your Roman collection, define what counts as a match, and keep a source-backed record of the rulers you still need.',
    sections:[
      {title:'Decide what the set covers',paragraphs:[
        '“One coin per emperor” can mean a short run or a lifetime project. Pick a period or group you can describe in a sentence. Decide whether a coin needs to show the ruler, name them in the inscription, or simply have been issued under their authority. Write down how you’ll treat provincial issues, posthumous issues, and uncertain attributions.',
        'You can start with the first-century Roman emperor checklist in NumiAgent and edit it to suit your goal. If you want only silver coins or a particular mint, write that into the rule so the checklist reflects the pieces you actually intend to collect.'
      ]},
      {title:'Keep a reference with each slot',paragraphs:[
        'Record a name, a reference link, and any denomination or type requirement. Reigns and family names can make the same piece appear relevant to more than one slot. A stable ruler identifier and a note about why a specimen qualifies help you resolve that later.',
        'Nomisma gives numismatic concepts stable identifiers. Use it to keep the ruler or mint reference consistent, and keep the type reference on the specimen itself when you know it.'
      ],links:[{href:'https://www.nomisma.org/',label:'Nomisma linked numismatic references'}]},
      {title:'Choose the reference that matches the kind of issue',paragraphs:[
        'Online Coins of the Roman Empire uses the Roman Imperial Coinage numbering system. It is a good place to verify imperial types and compare specimens held by different institutions. Roman Provincial Coinage Online covers civic and provincial coinage. When your checklist includes provincials, use the matching corpus and retain the full reference rather than putting both kinds of identifiers in an ambiguous numeric field.',
        'Keep a ruler’s authority separate from a person depicted on the coin. In OCRE’s RIC I second edition Augustus 208 record, Augustus is the authority and appears on the obverse. The reverse shows Gaius and Lucius Caesar. Under a checklist rule based on issuing authority, this fills an Augustus slot. A portrait or family theme could use a separate rule and match the reverse figures. Record which rule you used so the same decision can be applied across the collection.'
      ],links:[
        {href:'https://isaw.nyu.edu/publications/research-reference/ocre',label:'Institute for the Study of the Ancient World on OCRE'},
        {href:'https://rpc.ashmus.ox.ac.uk/',label:'Roman Provincial Coinage Online'},
        {href:'https://numismatics.org/ocre/id/ric.1%282%29.aug.208',label:'OCRE type record for RIC I Augustus 208'}
      ]},
      {title:'Give each gap a next step',paragraphs:[
        'Check the owned entries before treating the gaps as a shopping list. Correct ambiguous records and decide whether an alternate type already fits your rules. For each remaining gap, turn the name into a specific search by adding a denomination or catalog reference.',
        'Revisit the checklist after an acquisition or a correction. An updated attribution may fill a gap without needing another purchase, and a better photo can turn a tentative match into one you’re comfortable keeping.'
      ],links:[{href:'/app#themes',label:'Open themes in NumiAgent'},{href:'/blog/compare-coin-auction-prices',label:'Compare realized auction prices'}]}
    ]
  }
]
