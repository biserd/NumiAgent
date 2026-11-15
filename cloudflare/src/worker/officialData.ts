import { z } from 'zod'
import { boundedBody, fail, limit, router } from './core.ts'

const day=86400000
const currency=z.string().regex(/^[A-Z]{3}$/)
const ratesQuery=z.object({from:currency,to:currency,date:z.iso.date()})
const ocreId=/^ric\.[a-z0-9.()_-]{4,120}$/i

export const exchangeRates=router()
exchangeRates.get('/',async c=>{
  const input=ratesQuery.safeParse(c.req.query())
  if(!input.success) return fail(400,'Use three-letter currencies and a sale date')
  const {from,to,date}=input.data
  if(from===to || date<'1999-01-04' || date>new Date().toISOString().slice(0,10)) {
    return fail(400,'Choose different currencies and a past ECB reference date from 1999 onward')
  }
  await limit(c.env,'ecb',c.get('user').id,40)
  await limit(c.env,'ecb','global',400)
  const keys=[from,to].filter(code=>code!=='EUR').sort()
  const start=new Date(Date.parse(date)-7*day).toISOString().slice(0,10)
  const url=new URL('https://data-api.ecb.europa.eu/service/data/EXR/D.'+keys.join('+')+'.EUR.SP00.A')
  url.search=new URLSearchParams({startPeriod:start,endPeriod:date,format:'csvdata',detail:'dataonly'}).toString()
  // Workers supports manual redirects. Treat every non-success status as a provider failure.
  const response=await fetch(url,{headers:{Accept:'text/csv'},redirect:'manual',signal:AbortSignal.timeout(10000)})
    .catch(error=>{
      console.warn('ECB reference data request failed',{kind:error instanceof Error?error.name:'unknown'})
      return fail(503,'ECB reference rates are temporarily unavailable')
    })
  if(response.status===404 || response.status===204) return fail(404,'No ECB reference rate for both currencies in the preceding seven days')
  if(!response.ok){
    console.warn('ECB reference data HTTP status',response.status)
    return fail(503,'ECB reference rates are temporarily unavailable')
  }
  const data=new TextDecoder().decode(await boundedBody(response,32*1024))
  const quote=ecbQuote(data,from,to,start,date)
  if(!quote) return fail(404,'No ECB reference rate for both currencies in the preceding seven days')
  return c.json({...quote,source:url.href,provider:'European Central Bank',basis:'reference_rate'})
})

export function ecbQuote(csv:string,from:string,to:string,start:string,end:string) {
  const [head,...rows]=csv.trim().split(/\r?\n/)
  const headers=head.split(',')
  const codeIndex=headers.indexOf('CURRENCY')
  const dateIndex=headers.indexOf('TIME_PERIOD')
  const valueIndex=headers.indexOf('OBS_VALUE')
  if(Math.min(codeIndex,dateIndex,valueIndex)<0) return null
  const dates=new Map<string,Map<string,number>>()
  for(const row of rows){
    const fields=row.split(',')
    const code=fields[codeIndex], date=fields[dateIndex], amount=Number(fields[valueIndex])
    if(![from,to].includes(code) || !z.iso.date().safeParse(date).success || date<start || date>end || !Number.isFinite(amount) || amount<=0) continue
    const values=dates.get(date) ?? new Map<string,number>([['EUR',1]])
    values.set(code,amount)
    dates.set(date,values)
  }
  for(const date of [...dates.keys()].sort().reverse()){
    const values=dates.get(date)!
    const fromRate=values.get(from), toRate=values.get(to)
    if(fromRate && toRate) return {currency:to,date,rate:Number((toRate/fromRate).toPrecision(12))}
  }
  return null
}

const node=z.object({'@id':z.string(),'@type':z.union([z.string(),z.array(z.string())]).optional()}).catchall(z.unknown())
const graph=z.object({'@graph':z.array(node).max(1000)})
const literal=z.array(z.object({'@value':z.string(),'@language':z.string().optional()}))
const links=z.array(z.object({'@id':z.string()}))
const textValue=(value:unknown)=>{
  const rows=literal.safeParse(value).data ?? []
  return (rows.find(row=>row['@language']==='en') ?? rows.find(row=>!row['@language']))?.['@value'] ?? null
}
const nomismaLinks=(value:unknown)=>(links.safeParse(value).data ?? []).map(row=>row['@id'])
  .filter(uri=>/^https?:\/\/(?:www\.)?nomisma\.org\/id\/[a-z0-9_()-]+$/i.test(uri)).map(uri=>uri.replace(/^http:/,'https:'))

export function parseOcre(payload:unknown,identifier:string){
  const entries=graph.safeParse(payload).data?.['@graph'] ?? []
  const candidate=entries.find(entry=>entry['@id'].replace(/^https?:\/\/(?:www\.)?numismatics\.org\/ocre\/id\//i,'')===identifier)
  const label=textValue(candidate?.['skos:prefLabel'])
  if(!candidate || !label) return null
  const side=(name:string)=>{
    const description=entries.find(entry=>entry['@id']===candidate['@id']+'#'+name)
    return {legend:textValue(description?.['nmo:hasLegend']),description:textValue(description?.['dcterms:description'])}
  }
  return {id:identifier,label,source:'https://numismatics.org/ocre/id/'+encodeURIComponent(identifier),
    attribution:'Online Coins of the Roman Empire (ANS and NYU ISAW)',license:'ODbL 1.0',
    authority:nomismaLinks(candidate['nmo:hasAuthority']),denomination:nomismaLinks(candidate['nmo:hasDenomination']),
    mint:nomismaLinks(candidate['nmo:hasMint']),material:nomismaLinks(candidate['nmo:hasMaterial']),
    startDate:textValue(candidate['nmo:hasStartDate']),endDate:textValue(candidate['nmo:hasEndDate']),
    obverse:side('obverse'),reverse:side('reverse')}
}
export const ocre=router()
ocre.get('/',async c=>{
  const input=c.req.query('id') ?? ''
  const identifier=input.trim().replace(/^https:\/\/(?:www\.)?numismatics\.org\/ocre\/id\//i,'')
    .replace(/%28/gi,'(').replace(/%29/gi,')').toLowerCase()
  if(!ocreId.test(identifier)) return fail(400,'Enter an OCRE type identifier or its original HTTPS record URL')
  await limit(c.env,'ocre',c.get('user').id,35)
  await limit(c.env,'ocre','global',350)
  const target='https://numismatics.org/ocre/id/'+encodeURIComponent(identifier)+'.jsonld'
  const response=await fetch(target,{headers:{Accept:'application/ld+json'},redirect:'manual',signal:AbortSignal.timeout(10000)})
    .catch(error=>{
      console.warn('OCRE reference data request failed',{kind:error instanceof Error?error.name:'unknown'})
      return fail(503,'OCRE is temporarily unavailable')
    })
  if(response.status===404) return fail(404,'OCRE did not find that type')
  if(!response.ok){
    console.warn('OCRE reference data HTTP status',response.status)
    return fail(503,'OCRE is temporarily unavailable')
  }
  let payload:unknown
  try{payload=JSON.parse(new TextDecoder().decode(await boundedBody(response,256*1024)))}
  catch{return fail(503,'OCRE returned an unreadable record')}
  const reference=parseOcre(payload,identifier)
  if(!reference) return fail(404,'OCRE did not return an English type record')
  return c.json(reference)
})
