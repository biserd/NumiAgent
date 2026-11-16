import { boundedBody } from './core.ts'
import { fetchOcreReference, ocreId, parseOcre, readOcreReference } from './officialData.ts'
import type { Observation } from './vision.ts'
import { isRomanCoin } from './vision.ts'
import { item } from '../shared/domain.ts'

type OcreType = NonNullable<ReturnType<typeof parseOcre>>
type CatalogMatch = Pick<OcreType,'id'|'label'|'source'|'obverse'|'reverse'|'attribution'>
export type CatalogObservation = Observation & {catalogMatches?:CatalogMatch[];catalogMatchCount?:number}

function letters(value:string) {
  return value.toUpperCase().replace(/U/g,'V').replace(/J/g,'I').replace(/[^A-Z]/g,'')
}

function legendAnchor(value:string) {
  const words=value.match(/[A-Z]{1,36}/gi) ?? []
  if (words.length>2 && words.every(word=>word.length===1)) return letters(value)
  return words.map(letters).filter(word=>word.length>=3).sort((a,b)=>b.length-a.length)[0] ?? ''
}

function matchesLegend(observed:string,catalog:string|null,minimum:number) {
  const readable=observed.split(/[.?…\[\]]/).map(letters).filter(fragment=>fragment.length>=minimum)
  return !!catalog && readable.length>0 && readable.every(fragment=>letters(catalog).includes(fragment))
}

const diagnostics=[
  /\bdolphin\b/,/\bdove\b/,/\bscept(?:re|er)\b/,/\brudder\b/,/\bapple\b/,/\bstephane\b/,
  /\bband of pearls\b/,/\bbare[- ]headed\b/,/\blaureate\b/,/\bradiate\b/,/\bveiled\b/,
  /\bseated\b/,/\bstanding\b/,/\bshield\b/,/\bwreath\b/,/\bcornucopia\b/
]

function diagnosticScore(visual:string|undefined,catalog:string|null) {
  return diagnostics.filter(trait=>trait.test((visual ?? '').toLowerCase()) && trait.test((catalog ?? '').toLowerCase())).length
}

function secureDesign(visual:string|undefined,catalog:string|null) {
  if (!visual || !catalog || /\b(possible|possibly|maybe|uncertain|unreadable|unclear|or)\b/i.test(visual)) return false
  const stable=diagnostics.filter(trait=>!/standing|seated/.test(trait.source))
  return stable.some(trait=>trait.test(visual.toLowerCase()) && trait.test(catalog.toLowerCase()))
}

function compatiblePose(visual:string|undefined,catalog:string|null) {
  const pose=(value:string|undefined|null)=>{
    const seated=/\bseated\b/i.test(value ?? '')
    const standing=/\bstanding\b/i.test(value ?? '')
    return seated===standing ? '' : seated ? 'seated' : 'standing'
  }
  const observed=pose(visual)
  const recorded=pose(catalog)
  return !observed || !recorded || observed===recorded
}

const concept=(uri:string|undefined)=>uri?.split('/').at(-1) ?? ''
const conceptLabel=(id:string)=>id.split('_').map(word=>/^[ivx]+$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase()+word.slice(1)).join(' ')
const metals:Record<string,string>={ar:'Silver',av:'Gold',ae:'Bronze'}
const portraitSearch = new Map([
  ['faustina ii','Faustina the Younger'], ['faustina junior','Faustina the Younger'], ['faustina minor','Faustina the Younger'],
  ['faustina i','Faustina the Elder'], ['faustina senior','Faustina the Elder'], ['faustina major','Faustina the Elder']
])

function common(values:string[]) {
  const [value]=values
  return value && values.every(other=>value===other) ? value : ''
}

function datedRange(start:number,end:number) {
  if (start===end) return start<0 ? `${-start} BCE` : `${start} CE`
  if (end<0) return `${-start}–${-end} BCE`
  return start<0 ? `${-start} BCE–${end} CE` : `${start}–${end} CE`
}

function summarizeMatches(observation:Observation,matching:OcreType[],complete:boolean,
  evidence:'design'|'legends',exact?:OcreType):CatalogObservation {
  const observed=observation.details
  const denom=common(matching.map(record=>concept(record.denomination[0])))
  const portrait=common(matching.map(record=>concept(record.obverse.portrait[0])))
  const mint=common(matching.map(record=>concept(record.mint[0])))
  const metal=common(matching.map(record=>concept(record.material[0])))
  const rome=common(matching.map(record=>concept(record.authority[0])))
  const start=Number(common(matching.map(record=>record.startDate ?? '')))
  const end=Number(common(matching.map(record=>record.endDate ?? '')))
  const hasDates=evidence==='legends' && complete && Number.isInteger(start) && Number.isInteger(end) && start!==0 && end!==0 && start<=end
  const scored=matching.map(record=>({record,score:diagnosticScore(observed?.obverse,record.obverse.description)
    +diagnosticScore(observed?.reverse,record.reverse.description)})).sort((a,b)=>b.score-a.score)
  const person=complete && portrait ? conceptLabel(portrait) : observation.ruler
  const denomination=complete && denom ? conceptLabel(denom) : observation.denomination
  return {...observation,
    title:complete && person && denomination ? `${person} — ${denomination}` : observation.title,
    issuer:'Roman Empire',
    ruler:person, denomination,
    catalogEvidence:exact ? 'exact' : complete && portrait && denom ? evidence : undefined,
    year:observation.visibleDate ? observation.year : hasDates ? datedRange(start,end) : '',
    reference:exact?.id ?? '',
    details:item.shape.details.parse({...observed,...(evidence==='legends' && complete && mint ? {mint:conceptLabel(mint)} : {}),...(complete && metals[metal] ? {metal:metals[metal]} : {}),
      ...(hasDates ? {dateFrom:start,dateTo:end} : {}),...(exact ? {referenceUrl:exact.source} : {}),
      ...(evidence==='legends' && complete && rome ? {series:`Roman imperial issue under ${conceptLabel(rome)}`} : {})}),
    catalogMatches:scored.slice(0,5).map(({record:{id,label,source,obverse,reverse,attribution}})=>({id,label,source,obverse,reverse,attribution})),
    catalogMatchCount:matching.length}
}

export function applyOcreMatches(observation:Observation,records:OcreType[],complete:boolean):CatalogObservation {
  const observed=observation.details
  if (!observed?.obverseLegend || !observed.reverseLegend) return observation
  const sameLegends=records.filter(record=>matchesLegend(observed.obverseLegend,record.obverse.legend,5) &&
    matchesLegend(observed.reverseLegend,record.reverse.legend,4))
  const matching=sameLegends.filter(record=>observation.confidence===0 || compatiblePose(observed.reverse,record.reverse.description))
  if (!matching.length) return observation
  const [first]=matching
  const exact=complete && sameLegends.length===1 &&
    letters(observed.obverseLegend)===letters(first.obverse.legend ?? '') &&
    letters(observed.reverseLegend)===letters(first.reverse.legend ?? '') &&
    secureDesign(observed.obverse,first.obverse.description) &&
    secureDesign(observed.reverse,first.reverse.description) ? first : undefined
  return summarizeMatches(observation,matching,complete,'legends',exact)
}

async function fetchOcreFeed(query:string,signal:AbortSignal) {
  const target=new URL('https://numismatics.org/ocre/feed/')
  target.searchParams.set('q',query)
  const answer=await fetch(target,{headers:{Accept:'application/atom+xml'},redirect:'manual',signal})
  if (!answer.ok) return null
  return new TextDecoder().decode(await boundedBody(answer,128*1024))
}

function resultCount(xml:string|null) {
  return Number(xml?.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/)?.[1])
}

async function lookupOcre(query:string,signal:AbortSignal) {
  const xml=await fetchOcreFeed(query,signal)
  if (!xml) return null
  const ids=[...new Set(Array.from(xml.matchAll(/<entry\b[^>]*>[\s\S]*?<id>([^<]+)<\/id>/g),entry=>entry[1].trim()).filter(id=>ocreId.test(id)))]
  const total=resultCount(xml)
  const hits=await Promise.allSettled(ids.slice(0,12).map(async id=>{
    const response=await fetchOcreReference(id,signal)
    return response.ok ? readOcreReference(response,id) : null
  }))
  const records=hits.flatMap(hit=>hit.status==='fulfilled' && hit.value ? [hit.value] : [])
  return {records,complete:Number.isInteger(total) && total===records.length}
}

function portraitScope(observation:Observation) {
  if (observation.confidence < .8 || !/^[a-z ]{4,70}$/i.test(observation.ruler)) return undefined
  const metal=Object.values(metals).find(value=>value.toLowerCase()===observation.details?.metal?.toLowerCase())
  if (!metal) return undefined
  const portrait=portraitSearch.get(observation.ruler.toLowerCase()) ?? observation.ruler
  return {portrait,metal,query:`portrait_facet:"${portrait}" AND material_facet:"${metal}"`}
}

export function ocreDesignQuery(observation:Observation) {
  const scope=portraitScope(observation)
  const reverse=observation.details?.reverse?.toLowerCase() ?? ''
  const pose=/\bstanding\b/.test(reverse) ? 'standing' : /\bseated\b/.test(reverse) ? 'seated' : ''
  const object=/\b(dolphin|dove)\b/.exec(reverse)?.[0]
    ?? /\b(apple|pomegranate|fruit)\b/.exec(reverse)?.[0]
    ?? /\b(rudder|shield|cornucopia|wreath|sceptre|scepter|torch)\b/.exec(reverse)?.[0]
  const terms=object==='fruit' ? ['apple','pomegranate'] : object==='scepter' ? ['sceptre'] : object ? [object] : []
  if (!scope || !pose || !terms.length) return undefined
  const motif=terms.map(term=>'fulltext:'+term).join(' OR ')
  return `${scope.query} AND fulltext:${pose} AND (${motif})`
}

const denominations:Record<string,string[]>={
  Silver:['Denarius','Antoninianus','Quinarius','Siliqua','Miliarense','Argenteus'],
  Gold:['Aureus','Solidus','Tremissis','Semissis'],
  Bronze:['As','Dupondius','Sestertius','Follis']
}

async function checkPortraitDenomination(observation:CatalogObservation,signal:AbortSignal):Promise<CatalogObservation> {
  const scope=portraitScope(observation)
  if (!scope) return observation
  const count=async (query:string)=>resultCount(await fetchOcreFeed(query,signal))
  const forDenom=(label:string)=>count(`${scope.query} AND denomination_facet:"${label}"`)
  const labels=denominations[scope.metal]
  const known=labels.find(label=>label.toLowerCase()===observation.denomination.toLowerCase())
  if (known && await forDenom(known)>0) return observation
  const [total,...counts]=await Promise.all([count(scope.query),...labels.map(forDenom)])
  if (!Number.isInteger(total) || total<8 || counts.some(n=>!Number.isInteger(n))) return observation
  const dominant=labels.find((_,i)=>counts[i]>=.9*total)
  // This is a likely denomination for the identified portrait, never an exact attribution.
  return dominant ? {...observation,title:`${observation.ruler} — ${dominant}`,
    denomination:dominant,reference:'',catalogEvidence:'portrait'} : observation
}

export async function matchOcreLegends(observation:Observation):Promise<CatalogObservation> {
  if (!isRomanCoin(observation)) return observation
  const front=legendAnchor(observation.details?.obverseLegend ?? '')
  const back=legendAnchor(observation.details?.reverseLegend ?? '')
  try {
    const signal=AbortSignal.timeout(15000)
    let shortlist:CatalogObservation=observation
    if (front.length>=5 && back.length>=4) {
      // Search across denominations so a model guess cannot exclude a competing reference.
      const metal=Object.values(metals).find(value=>value.toLowerCase()===observation.details?.metal?.toLowerCase())
      const filter=observation.confidence===0 && metal ? ` AND material_facet:"${metal}"` : ''
      const result=await lookupOcre(`fulltext:${front} AND fulltext:${back}${filter}`,signal)
      if (result) {
        const withLegends=applyOcreMatches(observation,result.records,result.complete)
        if (withLegends.catalogEvidence || observation.confidence===0) return withLegends
        shortlist=withLegends
      }
    }
    const query=ocreDesignQuery(observation)
    if (query) {
      const result=await lookupOcre(query,signal)
      if (result?.records.length) {
        const withDesign=summarizeMatches(observation,result.records,result.complete,'design')
        if (withDesign.catalogEvidence) return withDesign
        if (!shortlist.catalogMatches?.length) shortlist=withDesign
      }
    }
    return await checkPortraitDenomination(shortlist,signal)
  } catch {
    return observation
  }
}
