import assert from 'node:assert/strict'
import test from 'node:test'
import { encode, decode } from 'jpeg-js'
import { csv, item, matchesSlot, romanTheme, slot, valueSales } from '../src/shared/domain.ts'
import { convertLegacyCoin, legacyCoin } from '../src/shared/legacy.ts'
import { matchReference } from '../src/shared/references.ts'
import { ecbQuote, parseOcre } from '../src/worker/officialData.ts'
import { applyOcreMatches, ocreDesignQuery } from '../src/worker/ocreIdentification.ts'
import { findCircularRim } from '../src/worker/coinCloseup.ts'
import { normalizeEbay } from '../src/worker/ebay.ts'
import { parseThemeDraft } from '../src/worker/themePlanning.ts'
import { automaticCatalogCandidate, parsePhotoCandidates, parseRomanLegends } from '../src/worker/vision.ts'
import { searchSyllogeum } from '../src/worker/syllogeum.ts'
import { searchGoogleVision } from '../src/worker/googleVision.ts'
import { rankScanLeads, researchScan, scanQuery } from '../src/worker/scanResearch.ts'

test('An observed gazelle can launch discovery and a bull facing left separates the Carian references',()=>{
  const observed={type:'coin',details:{reverse:'Head of a gazelle facing left, with ringed horns'}}
  const query=scanQuery(observed)
  assert.match(query,/\bgazelle\b/)
  assert.doesNotMatch(query,/Caria|obol|CNG|287|203/i)
  const references=[
    {source:'https://www.wildwinds.com/example/right',label:'Timeline 696',attribution:'Fixture',obverse:'Bull right',reverse:'Gazelle head left'},
    {source:'https://www.wildwinds.com/example/left',label:'CNG 287, lot 203',attribution:'Fixture',obverse:'Bull left',reverse:'Gazelle head left'}
  ]
  assert.deepEqual(rankScanLeads(references,observed).map(hit=>hit.conflicts),[[],[]])
  const pair={...observed,details:{...observed.details,obverse:'Forepart of a bull facing left'}}
  const ranked=rankScanLeads(references,pair)
  assert.equal(ranked[0].label,'CNG 287, lot 203')
  assert.deepEqual(ranked[1].conflicts,['bull faces right in this reference'])
  assert.doesNotMatch(scanQuery({type:'banknote',issuer:'Bank of Canada',denomination:'1 dollar',details:{serial:'B340595B'}}),/B340595B/)
})

test('An opted-in scan falls back to Google on specialist failure and sends only the cropped coin',async()=>{
  const width=600,height=700
  const data=new Uint8Array(width*height*4).fill(255)
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    if(Math.hypot(x-306,y-379)>174) continue
    const index=(y*width+x)*4
    data[index]=data[index+1]=data[index+2]=65
  }
  const photo={mime:'image/jpeg',bytes:encode({data,width,height},90).data}
  let consent=0
  const env={GOOGLE_VISION_API_KEY:'fixture',FIRECRAWL_API_KEY:'fixture',
    DB:{prepare:sql=>({bind:()=>({first:async()=>sql.startsWith('SELECT')
      ? {external_photo_search:consent} : {count:1}})})}}
  const calls=[]
  const fetchFixture=async(url,request)=>{
    calls.push(new URL(url).hostname)
    if(url.startsWith('https://syllogeum.org')) return new Response(null,{status:503})
    if(url.startsWith('https://api.firecrawl.dev')) {
      const search=JSON.parse(request.body)
      assert.match(search.query,/gazelle/)
      assert.doesNotMatch(search.query,/Caria|obol|CNG/)
      assert.equal(search.scrapeOptions,undefined)
      return Response.json({success:true,data:{web:[{
        url:'https://www.wildwinds.com/coins/greece/caria/uncertain/i.html',title:'Uncertain mints of Caria',description:'Head of gazelle left'
      }]}})
    }
    const {requests}=JSON.parse(request.body)
    const image=decode(Buffer.from(requests[0].image.content,'base64'))
    assert.ok(image.width<width && image.height<height)
    return Response.json({responses:[{webDetection:{pagesWithMatchingImages:[{url:'https://www.reddit.com/r/AncientCoins/',pageTitle:'Discussion'}]}}]})
  }
  const observation={type:'coin',details:{reverse:'Gazelle head left'}}
  const privateResult=await researchScan(env,'collector',observation,[photo],async()=>true,fetchFixture)
  assert.deepEqual(calls,['api.firecrawl.dev'])
  assert.equal(privateResult.providers.google,'disabled')
  consent=1
  const result=await researchScan(env,'collector',observation,[photo],async()=>true,fetchFixture)
  assert.equal(result.providers.syllogeum,'unavailable')
  assert.equal(result.providers.google,'complete')
  assert.equal(calls.at(-1),'vision.googleapis.com')
  assert.equal(result.leads[0].label,'Uncertain mints of Caria')
  assert.match(result.next,/other side/)
})

test('Google Web Detection sends only coin images with the server key and presents sourced web pages',async()=>{
  const front={bytes:Uint8Array.of(1),mime:'image/png'}
  const back={bytes:Uint8Array.of(2),mime:'image/png'}
  const sent=[]
  const result=await searchGoogleVision([front,back],'test-vision-key',async (url,init)=>{
    assert.equal(url,'https://vision.googleapis.com/v1/images:annotate')
    assert.equal(init.redirect,'error')
    assert.equal(init.headers['x-goog-api-key'],'test-vision-key')
    const {requests}=JSON.parse(init.body)
    const content=requests[0].image.content
    sent.push(content)
    assert.deepEqual(requests,[{image:{content},features:[{type:'WEB_DETECTION',maxResults:10}]}])
    return Response.json({responses:[content==='AQ=='
      ? {webDetection:{pagesWithMatchingImages:[{url:'http://example.test/front',pageTitle:'<b>Front</b>'},
        {url:'https://example.test/front'},{url:'javascript:alert(1)'}]}}
      : {webDetection:{pagesWithMatchingImages:[{url:'https://example.test/back'}],
        visuallySimilarImages:[{url:'https://example.test/image'}]}}
    ]})
  })
  assert.deepEqual(sent.sort(),['AQ==','Ag=='])
  assert.deepEqual(result,{photoCount:2,matches:[
    {source:'https://example.test/front',label:'Front',attribution:'Google Cloud Vision',obverse:'',reverse:''},
    {source:'https://example.test/back',label:'example.test',attribution:'Google Cloud Vision',obverse:'',reverse:''}
  ]})
  await assert.rejects(searchGoogleVision([front],'test-vision-key',async()=>Response.json({
    responses:[{error:{code:7}}]
  })),/could not process/)
})

test('Visual coin search tries both orientations and returns unique, attributed reference links',async()=>{
  const front={bytes:Uint8Array.of(1),mime:'image/png'}
  const back={bytes:Uint8Array.of(2),mime:'image/png'}
  const forms=[]
  const fetchFixture=async (url,init)=>{
    assert.equal(url,'https://syllogeum.org/search')
    assert.equal(init.redirect,'error')
    const uploaded=async side=>new Uint8Array(await init.body.get(side).arrayBuffer())[0]
    const orientation=[await uploaded('obverse'),await uploaded('reverse')]
    forms.push(orientation)
    return Response.json({results:[
      {type_label:'Reference type',type_url:'http://numismatics.org/type/id',attribution:'Museum',
        type_card:{obv_desc:'Bull facing left',rev_desc:'Gazelle head left'},score:.7},
      {type_label:'Unsafe link',source_url:'javascript:alert(1)',score:.99},
      {type_label:'Malformed result'},
    ]})
  }
  assert.deepEqual(await searchSyllogeum([front,back],fetchFixture),{photoCount:2,matches:[
    {label:'Reference type',source:'https://numismatics.org/type/id',attribution:'Museum',obverse:'Bull facing left',reverse:'Gazelle head left'},
  ]})
  assert.deepEqual(forms.sort(),[[1,2],[2,1]])
})

test('Visual coin search handles one face and distinguishes provider failure from an empty response',async()=>{
  const image={bytes:Uint8Array.of(1),mime:'image/png'}
  const slots=[]
  const result=await searchSyllogeum([image],async (_url,{body})=>{
    slots.push(...[...body.keys()].filter(key=>key!=='k'))
    return Response.json({results:[]})
  })
  assert.deepEqual(result,{photoCount:1,matches:[]})
  assert.deepEqual(slots.sort(),['obverse','reverse'])
  await assert.rejects(searchSyllogeum([image],async (_url,{body})=>
    body.has('obverse') ? new Response(null,{status:503}) : Response.json({results:[]})),/unavailable/)
})

test('Photo review keeps an identifiable coin when Gemma returns null, numeric text, or an unusable crop',()=>{
  const response = JSON.stringify([
    {type:'coin', title:'Jefferson nickel', year:2007, issuer:null, reference:null, confidence:'91%',
      details:{mint:null, mintMark:'D'}, crop:{x:.82,y:.4,width:.32,height:.4}},
    { type:'unclear', title:'Uncertain second object' }
  ])
  const [coin,...others] = parsePhotoCandidates('~~~json\n' + response + '\n~~~')
  assert.equal(others.length,0)
  assert.equal(coin.year,'2007')
  assert.equal(coin.reference,'')
  assert.equal(coin.details.mintMark,'D')
  assert.equal(coin.confidence,.91)
  assert.equal(coin.crop,undefined)
  assert.deepEqual(parsePhotoCandidates('[]'),[])
  assert.throws(()=>parsePhotoCandidates('[null]'),/no valid candidates/)
})

test('Automatic cataloging needs one complete match with a visible year',()=>{
  const nickel = {type:'coin',title:'Jefferson nickel',issuer:'United States',denomination:'5 cents',year:2007,confidence:.98,visibleDate:true}
  const decide = (...results) => automaticCatalogCandidate(parsePhotoCandidates(JSON.stringify(results)))
  assert.equal(decide(nickel).year,'2007')
  assert.equal(decide({...nickel,visibleDate:false}),undefined)
  assert.equal(decide({...nickel,year:'2007/2008'}),undefined)
  assert.equal(decide({...nickel,denomination:'Unknown'}),undefined)
  assert.equal(decide({...nickel,confidence:.75}),undefined)
  assert.equal(decide(nickel,{type:'unknown'}),undefined)
  assert.equal(decide(nickel,nickel),undefined)
})

test('Theme drafts accept string years and strip unsourced references and URLs',()=>{
  const draft=JSON.stringify({name:'Test draft',slots:[
    {label:'Solidus from 501–600',type:'coin',denomination:'Solidus',dateFrom:'501',dateTo:'600',ruler:null,series:'',reference:'Made-up reference',source:'https://example.test/'},
    {label:'Invalid range',type:'coin',dateFrom:'800',dateTo:'700'}
  ]})
  const parsed=parseThemeDraft(draft,'One solidus per century')
  assert.equal(parsed.slots.length,1)
  assert.equal(parsed.slots[0].dateFrom,501)
  assert.equal(parsed.slots[0].reference,'')
  assert.equal(parsed.slots[0].source,undefined)
})

test('ECB cross-rates require both observations on the same eligible date',()=>{
  const data='CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-11-13,1.2\nGBP,2026-11-13,0.8\nUSD,2026-11-14,1.3\nGBP,2026-11-15,0.9'
  assert.deepEqual(ecbQuote(data,'USD','GBP','2026-11-07','2026-11-14'),{currency:'GBP',date:'2026-11-13',rate:0.666666666667})
  assert.deepEqual(ecbQuote(data,'EUR','USD','2026-11-07','2026-11-14'),{currency:'USD',date:'2026-11-14',rate:1.3})
  assert.equal(ecbQuote(data,'USD','JPY','2026-11-07','2026-11-14'),null)
})

test('OCRE must return the exact type and only carries Nomisma resource links',()=>{
  const identifier='ric.1(2).aug.208'
  const source='http://numismatics.org/ocre/id/'+identifier
  const record={'@graph':[{'@id':source,'skos:prefLabel':[{'@value':'Test Augustus type','@language':'en'}],
    'nmo:hasAuthority':[{'@id':'http://nomisma.org/id/augustus'},{'@id':'https://example.test/invalid'}]},
    {'@id':source+'#obverse','nmo:hasLegend':[{'@value':'AVGVSTVS'}]}]}
  assert.equal(parseOcre(record,'ric.1(2).aug.209'),null)
  const resolved=parseOcre(record,identifier)
  assert.deepEqual(resolved.authority,['https://nomisma.org/id/augustus'])
  assert.equal(resolved.obverse.legend,'AVGVSTVS')
})

test('Roman identification ranks a reverse diagnostic and keeps ambiguous RIC variants for review',()=>{
  const [observed]=parsePhotoCandidates(JSON.stringify([{type:'coin',title:'Roman silver',issuer:'Roman Empire',
    ruler:'Unknown',confidence:.98,details:{obverseLegend:'FAVSTINAE AVG PII AVG FIL',reverseLegend:'V E N V S',
      obverse:'Bare-headed bust facing right',reverse:'A standing figure holds an apple and a rudder with a dolphin at its foot'}}]))
  const record=(ref,animal)=>({
    id:ref,label:'RIC '+ref,source:'https://numismatics.org/ocre/id/'+ref,
    attribution:'Online Coins of the Roman Empire',license:'ODbL 1.0',startDate:'0145',endDate:'0161',
    authority:['https://nomisma.org/id/antoninus_pius'],denomination:['https://nomisma.org/id/denarius'],
    material:['https://nomisma.org/id/ar'],mint:['https://nomisma.org/id/rome'],
    obverse:{legend:'FAVSTINAE AVG PII AVG FIL',description:'Bare-headed bust of Faustina',portrait:['https://nomisma.org/id/faustina_ii']},
    reverse:{legend:'VENVS',description:'Venus standing, holding an apple and a rudder on a '+animal,portrait:[]}
  })
  const dolphin=record('ric.3.ant.517A_denarius','dolphin')
  const dove=record('ric.3.ant.515B_denarius','dove')
  const output=applyOcreMatches(observed,[dove,dolphin],true)
  assert.equal(observed.ruler,'')
  assert.equal(output.ruler,'Faustina II')
  assert.equal(output.year,'145–161 CE')
  assert.equal(output.denomination,'Denarius')
  assert.equal(output.catalogMatchCount,2)
  assert.equal(output.catalogMatches[0].id,dolphin.id)
  assert.equal(output.reference,'')
  assert.equal(automaticCatalogCandidate([output]),undefined)
  assert.equal(automaticCatalogCandidate([output],true).reference,'')
  assert.equal(automaticCatalogCandidate([{...output,catalogEvidence:'design'}],true),undefined)
  assert.equal(applyOcreMatches(observed,[dolphin],false).reference,'')
  assert.equal(applyOcreMatches(observed,[dolphin],true).reference,dolphin.id)
  const mismatch={...observed,details:{...observed.details,reverseLegend:'CERES'}}
  assert.equal(applyOcreMatches(mismatch,[dolphin],true),mismatch)
  const seated={...dolphin,reverse:{...dolphin.reverse,description:'Venus seated with an apple'}}
  assert.equal(applyOcreMatches(observed,[seated],true),observed)
  assert.equal(applyOcreMatches(observed,[seated,dolphin],true).reference,'')
  const uncertain={...observed,details:{...observed.details,obverse:'Possibly bare-headed'}}
  assert.equal(applyOcreMatches(uncertain,[dolphin],true).reference,'')
  const noisy={...observed,ruler:'Faustina II',denomination:'Siliqua',
    details:{...observed.details,metal:'Silver',reverse:'Standing figure, possibly holding a piece of fruit and a sceptre'}}
  assert.equal(ocreDesignQuery(noisy),
    'portrait_facet:"Faustina the Younger" AND material_facet:"Silver" AND fulltext:standing AND (fulltext:apple OR fulltext:pomegranate)')
  assert.deepEqual(parseRomanLegends('~~~json\n{"obverseLegend":"FAVSTINAE ? FIL","reverseLegend":"VENVS","reverse":"Unknown"}\n~~~'),
    {obverseLegend:'FAVSTINAE ? FIL',reverseLegend:'VENVS'})
})

test('The transcription close-up includes a small off-center rim and declines a uniform image',()=>{
  const width=128, height=144, centerX=71, centerY=99, radius=19
  const data=new Uint8Array(width*height*4).fill(220)
  assert.equal(findCircularRim({data,width,height}),null)
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    if (Math.hypot(x-centerX,y-centerY)>radius) continue
    const index=(y*width+x)*4
    data[index]=data[index+1]=data[index+2]=70
  }
  const result=findCircularRim({data,width,height})
  assert.ok(result && result.left <= centerX-radius && result.top <= centerY-radius)
  assert.ok(result.left+result.width >= centerX+radius && result.top+result.height >= centerY+radius)
  assert.ok(result.width < width && result.height < height)
})

test('eBay offers require an auction, approved item URL, and an end time to be active',()=>{
  const common={itemWebUrl:'https://www.ebay.com/itm/123',title:'Synthetic auction',buyingOptions:['AUCTION']}
  const checked='2026-11-14T10:00:00Z'
  const payload={itemSummaries:[{...common,itemEndDate:'2026-11-15T10:00:00Z',currentBidPrice:{value:'12.60',currency:'USD'}},
    {...common,itemWebUrl:'https://www.ebay.com/itm/124',itemEndDate:'2026-11-13T10:00:00Z'},
    {...common,itemWebUrl:'https://www.ebay.com/itm/125'},
    {...common,itemWebUrl:'https://ebay.com.example.test/itm/123'},{...common,buyingOptions:['FIXED_PRICE']}]}
  const results=normalizeEbay(payload,checked)
  assert.deepEqual(results.map(item=>item.state),['active','closed','unknown'])
  assert.deepEqual(results[0].price,{kind:'current_bid',amount:12.6,currency:'USD'})
})

test('Theme period matches require the specimen dates to fit within the requested interval',()=>{
  const period=slot.parse({label:'First-century coin',type:'coin',dateFrom:1,dateTo:100})
  const coin=input=>item.parse({type:'coin',title:'Test',...input})
  assert.equal(matchesSlot(period,coin({details:{dateFrom:98,dateTo:100}})),true)
  assert.equal(matchesSlot(period,coin({details:{dateFrom:98,dateTo:117}})),false)
  assert.equal(matchesSlot(period,coin({year:'98'})),true)
  assert.equal(matchesSlot(period,coin({year:'Unknown'})),false)
})

test('Roman ruler aliases are exact and auditable', () => {
  const rule = romanTheme.find(s=>s.label==='Caligula')
  assert.equal(rule.source, 'https://nomisma.org/id/gaius')
  assert.equal(matchesSlot(rule,item.parse({type:'coin',title:'Test',ruler:'Gaius Caligula'})),true)
  assert.equal(matchesSlot(rule,item.parse({type:'coin',title:'Test',ruler:'Gaius Julius Caesar'})),false)
  assert.equal(matchesSlot(rule,item.parse({type:'banknote',title:'Test',ruler:'Caligula'})),false)
})

test('Reference lookup uses the bundled Nomisma concepts and keeps the source',()=>{
  assert.equal(matchReference('metal','AR')?.source,'https://nomisma.org/id/ar')
  assert.equal(matchReference('mint','Roma')?.label,'Rome')
  assert.equal(matchReference('ruler','Caligula')?.attribution,'Nomisma.org')
  assert.equal(matchReference('ruler','Unknown ruler'),null)
})

test('NumisGraph imports preserve measurements, legends and dates without legacy owner or image IDs',()=>{
  const input=legacyCoin.parse({id:'original-id',title:'Legacy coin',weightG:'3.210',diameterMm:'17.01',axis:0,
    dateFrom:-3,dateTo:2,obvLegend:'IMP',revLegend:'ROMA',userId:'old-owner',obvImageId:'storage-id'})
  const output=convertLegacyCoin(input,null)
  assert.equal(output.year,'3 BC – 2 AD')
  assert.equal(output.details.weightG,3.21)
  assert.equal(output.details.diameterMm,17.01)
  assert.equal(output.details.dieAxis,0)
  assert.equal(output.details.obverseLegend,'IMP')
  assert.equal(output.details.reverseLegend,'ROMA')
  assert.equal(output.details.dateFrom,-3)
  assert.equal(output.details.dateTo,2)
  assert.ok(!JSON.stringify(output).includes('old-owner'))
  assert.ok(!JSON.stringify(output).includes('storage-id'))
})

test('Valuation selects fresh, strong same-grade results and separates the hammer from premium', ()=>{
  const record={verification:'fixture',url:'https://example.test/lot',currency:'USD',date:'2026-01-20',amount:100,
    auction:'Test sale',house:'Test house',grade:'VF',basis:'hammer',premium:20,match:'strong'}
  const data=[
    {...record,id:'A',lot:'1'}, {...record,id:'B',lot:'2',amount:200},
    {...record,id:'C',lot:'3',basis:'with_premium',amount:320},
    {...record,id:'D',lot:'1'}, {...record,id:'E',lot:'4',currency:'EUR'},
    {...record,id:'F',lot:'5',grade:'F'}, {...record,id:'G',lot:'6',premium:null},
    {...record,id:'H',lot:'7',date:'2007-01-01'}, {...record,id:'I',lot:'8',match:'possible'}
  ]
  const result=valueSales(data,'USD','VF',new Date('2026-11-14'))
  assert.deepEqual(result.used,['A','B','C'])
  assert.deepEqual(result.range,{low:180,median:240,high:280})
  assert.equal(valueSales(data,'EUR','VF',new Date('2026-11-14')).status,'insufficient_market_evidence')
})

test('CSV export neutralizes spreadsheet formulas and quotes cells',()=>{
  assert.equal(csv([['Title','Notes'],['=1+1','coin, "obverse"']]),'"Title","Notes"\r\n"\'=1+1","coin, ""obverse"""')
})

test('Valuation normalizes a dated, sourced exchange rate and excludes stale rates',()=>{
  const sale={id:'rate',verification:'fixture',url:'https://example.test/lot',currency:'EUR',date:'2026-01-20',amount:100,
    auction:'Test sale',house:'Test house',lot:'10',grade:'VF',basis:'hammer',premium:20,match:'strong',
    fx:{currency:'USD',rate:1.1,date:'2026-01-19',source:'https://example.test/fx'}}
  const result=valueSales([sale],'USD','VF',new Date('2026-11-14'))
  assert.ok(Math.abs(result.normalized[0].amount-132)<1e-9)
  assert.deepEqual(result.normalized[0].fx,sale.fx)
  const stale={...sale,fx:{...sale.fx,date:'2026-01-10'}}
  assert.equal(valueSales([stale],'USD','VF',new Date('2026-11-14')).normalized.length,0)
})
