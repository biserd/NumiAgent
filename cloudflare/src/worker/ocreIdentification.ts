import { boundedBody } from './core.ts'
import { fetchOcreReference, ocreId, parseOcre, readOcreReference } from './officialData.ts'
import type { Observation } from './vision.ts'
import { isRomanCoin } from './vision.ts'

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

function common(values:string[]) {
  const [value]=values
  return value && values.every(other=>value===other) ? value : ''
}

function datedRange(start:number,end:number) {
  if (start===end) return start<0 ? `${-start} BCE` : `${start} CE`
  if (end<0) return `${-start}–${-end} BCE`
  return start<0 ? `${-start} BCE–${end} CE` : `${start}–${end} CE`
}

export function applyOcreMatches(observation:Observation,records:OcreType[],complete:boolean):CatalogObservation {
  const observed=observation.details
  if (!observed?.obverseLegend || !observed.reverseLegend) return observation
  const matching=records.filter(record=>matchesLegend(observed.obverseLegend,record.obverse.legend,5) &&
    matchesLegend(observed.reverseLegend,record.reverse.legend,4) &&
    (observation.confidence===0 || compatiblePose(observed.reverse,record.reverse.description)))
  if (!matching.length) return observation
  const denom=common(matching.map(record=>concept(record.denomination[0])))
  const portrait=common(matching.map(record=>concept(record.obverse.portrait[0])))
  const mint=common(matching.map(record=>concept(record.mint[0])))
  const metal=common(matching.map(record=>concept(record.material[0])))
  const rome=common(matching.map(record=>concept(record.authority[0])))
  const start=Number(common(matching.map(record=>record.startDate ?? '')))
  const end=Number(common(matching.map(record=>record.endDate ?? '')))
  const hasDates=complete && Number.isInteger(start) && Number.isInteger(end) && start!==0 && end!==0 && start<=end
  const scored=matching.map(record=>({record,score:diagnosticScore(observed.obverse,record.obverse.description)
    +diagnosticScore(observed.reverse,record.reverse.description)})).sort((a,b)=>b.score-a.score)
  const exact=complete && matching.length===1 && letters(observed.obverseLegend)===letters(matching[0].obverse.legend ?? '') &&
    letters(observed.reverseLegend)===letters(matching[0].reverse.legend ?? '') &&
    (observation.confidence===0 || diagnosticScore(observed.reverse,matching[0].reverse.description)>0) ? matching[0] : undefined
  const person=complete && portrait ? conceptLabel(portrait) : observation.ruler
  const denomination=complete && denom ? conceptLabel(denom) : observation.denomination
  return {...observation,
    title:complete && person && denomination ? `${person} — ${denomination}` : observation.title,
    issuer:'Roman Empire',
    ruler:person, denomination,
    year:observation.visibleDate ? observation.year : hasDates ? datedRange(start,end) : '',
    reference:exact?.id ?? '',
    details:{...observed,...(complete && mint ? {mint:conceptLabel(mint)} : {}),...(complete && metals[metal] ? {metal:metals[metal]} : {}),
      ...(hasDates ? {dateFrom:start,dateTo:end} : {}),...(exact ? {referenceUrl:exact.source} : {}),
      ...(complete && rome ? {series:`Roman imperial issue under ${conceptLabel(rome)}`} : {})},
    catalogMatches:scored.slice(0,5).map(({record:{id,label,source,obverse,reverse,attribution}})=>({id,label,source,obverse,reverse,attribution})),
    catalogMatchCount:matching.length}
}

export async function matchOcreLegends(observation:Observation):Promise<CatalogObservation> {
  if (!isRomanCoin(observation)) return observation
  const front=legendAnchor(observation.details?.obverseLegend ?? '')
  const back=legendAnchor(observation.details?.reverseLegend ?? '')
  if (front.length<5 || back.length<4) return observation
  const target=new URL('https://numismatics.org/ocre/feed/')
  const denomination=observation.denomination.trim()
  const filter=/^(denarius|antoninianus|aureus|sestertius|dupondius|as|quinarius|solidus|follis)$/i.test(denomination)
    ? ' AND denomination_facet:"'+denomination[0].toUpperCase()+denomination.slice(1).toLowerCase()+'"'
    : (observation.details?.metal.toLowerCase()==='silver' ? ' AND material_facet:"Silver"' : '')
  target.searchParams.set('q',`fulltext:${front} AND fulltext:${back}${filter}`)
  try {
    const signal=AbortSignal.timeout(9000)
    const answer=await fetch(target,{headers:{Accept:'application/atom+xml'},redirect:'manual',signal})
    if (!answer.ok) return observation
    const xml=new TextDecoder().decode(await boundedBody(answer,128*1024))
    const ids=[...new Set(Array.from(xml.matchAll(/<entry\b[^>]*>[\s\S]*?<id>([^<]+)<\/id>/g),entry=>entry[1].trim()).filter(id=>ocreId.test(id)))]
    const total=Number(xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/)?.[1])
    const limit=12
    const hits=await Promise.allSettled(ids.slice(0,limit).map(async id=>{
      const response=await fetchOcreReference(id,signal)
      return response.ok ? readOcreReference(response,id) : null
    }))
    const matches=hits.flatMap(hit=>hit.status==='fulfilled' && hit.value ? [hit.value] : [])
    return applyOcreMatches(observation,matches,Number.isInteger(total) && total===matches.length)
  } catch {
    return observation
  }
}
