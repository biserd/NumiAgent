import assert from 'node:assert/strict'
import test from 'node:test'
import { csv, item, matchesSlot, romanTheme, slot, valueSales } from '../src/shared/domain.ts'
import { convertLegacyCoin, legacyCoin } from '../src/shared/legacy.ts'
import { matchReference } from '../src/shared/references.ts'
import { ecbQuote, parseOcre } from '../src/worker/officialData.ts'
import { normalizeEbay } from '../src/worker/ebay.ts'
import { parseThemeDraft } from '../src/worker/themePlanning.ts'

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
