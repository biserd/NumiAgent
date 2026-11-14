import assert from 'node:assert/strict'
import test from 'node:test'
import { csv, item, matchesSlot, romanTheme, valueSales } from '../src/shared/domain.ts'
import { convertLegacyCoin, legacyCoin } from '../src/shared/legacy.ts'
import { matchReference } from '../src/shared/references.ts'

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
