import { z } from 'zod'
import { boundedBody, limit, one } from './core.ts'
import type { Env } from './core.ts'
import { cropCoinJpeg } from './coinCloseup.ts'
import { searchSyllogeum } from './syllogeum.ts'
import { searchGoogleVision } from './googleVision.ts'
import { sourceLink } from './visualSearch.ts'
import type { CoinImage } from './visualSearch.ts'
import type { Observation } from './vision.ts'

export type ScanLead = {
  source:string;label:string;attribution:string;obverse?:string;reverse?:string;excerpt?:string;
  supports?:string[];conflicts?:string[]
}
type ProviderStatus = 'complete'|'unavailable'|'disabled'|'needs_crop'
export type ScanResult = {
  stage:'references'|'complete';leads:ScanLead[];providers:Record<string,ProviderStatus>;next?:string;
}
type ProviderResult = {status:ProviderStatus;leads:ScanLead[]}
const referenceDomains = ['wildwinds.com','numismatics.org','britishmuseum.org','rpc.ashmus.ox.ac.uk','numista.com']
const webResponse = z.object({success:z.literal(true),data:z.object({web:z.array(z.object({
  url:z.string(),title:z.string().optional(),description:z.string().optional()
})).max(15).optional()})})
const stopwords = new Set('a an the and of or to is on in from with facing appears possibly image photo coin worn lettering inscription visible'.split(' '))
const directional=/\b(left|right)\b/i
const familiar=/\b(?:gazelle|bull|lion|eagle|horse|ram|stag|goat|owl|dolphin|crab|elephant|portrait|bust)\b/i

function clean(value:string) {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ').trim()
}
function words(value:string) {
  return clean(value.toLowerCase().replace(/\bantelopes?\b/g,'gazelle')).split(' ')
    .filter(word=>word.length>1 && !stopwords.has(word))
}
function motifWords(value:string) {
  const tokens=words(value)
  const motif=tokens.find(word=>familiar.test(word))
  const direction=tokens.find(word=>directional.test(word))
  if (!motif) return tokens.slice(0,5)
  const form=tokens.find(word=>['head','forepart','standing','seated','running'].includes(word))
  return [motif,form,direction].filter(Boolean) as string[]
}

export function scanQuery(entry:Observation|undefined) {
  if (!entry) return ''
  const detail=entry.details
  const legend=[detail?.obverseLegend,detail?.reverseLegend]
    .flatMap(value=>value?.split('?').map(clean).filter(part=>part.length>=4).map(part=>'"'+part+'"') ?? [])
    .slice(0,2)
  const motifs=[detail?.obverse,detail?.reverse].flatMap(value=>value ? motifWords(value) : [])
  if (entry.type==='banknote' || entry.visibleDate) {
    const printed=[entry.issuer,entry.denomination,entry.visibleDate ? entry.year : '',detail?.mintMark,detail?.series]
      .filter(value=>!!value).map(value=>clean(value ?? '')).join(' ')
    return printed ? (printed+' '+entry.type).slice(0,170) : ''
  }
  if (!legend.length && !motifs.length) return ''
  return ['ancient coin',...legend,...new Set(motifs)].join(' ').slice(0,170)
}

export function rankScanLeads(leads:ScanLead[],entry:Observation|undefined) {
  const data=entry?.details
  const front=data?.obverse ?? ''
  const back=data?.reverse ?? ''
  const allWords=new Set(words([front,back,data?.obverseLegend,data?.reverseLegend].filter(Boolean).join(' ')))
  const keys=new Set<string>()
  return leads.flatMap(hit=>{
    const url=new URL(hit.source)
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
    url.searchParams.sort()
    if (keys.has(url.href)) return []
    keys.add(url.href)
    const compare=words([hit.label,hit.excerpt,hit.obverse,hit.reverse].filter(Boolean).join(' '))
    const supports=[...new Set(compare.filter(word=>allWords.has(word)))].slice(0,5)
    const conflicts=[]
    const described=hit.excerpt?.split(' / ')
    const describedSides=described?.length===2 && described.every(description=>familiar.test(description)) ? described : []
    for (const [visible,reference] of [[front,hit.obverse ?? describedSides[0]],[back,hit.reverse ?? describedSides[1]]]) {
      if (!reference || !visible) continue
      const first=clean(visible.toLowerCase()).replace('antelope','gazelle')
      const second=clean(reference.toLowerCase()).replace('antelope','gazelle')
      const motif=first.match(familiar)?.[0]
      const direction=first.match(directional)?.[1]
      const referenceDirection=second.match(directional)?.[1]
      if (motif && second.includes(motif) && direction && referenceDirection && direction!==referenceDirection) {
        conflicts.push(motif+' faces '+referenceDirection+' in this reference')
      }
    }
    const support=supports.reduce((score,word)=>score+(familiar.test(word) ? 4 : directional.test(word) ? 0 : 1),0)
    if (hit.attribution==='Catalog web search' && allWords.size>=2 && support===0) return []
    return [{lead:{...hit,source:url.href,supports,conflicts},score:support-conflicts.length*7}]
  }).sort((a,b)=>b.score-a.score).slice(0,6).map(row=>row.lead)
}

async function textReferences(query:string,key:string,request:typeof fetch) {
  const response=await request('https://api.firecrawl.dev/v2/search',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({query,limit:8,includeDomains:referenceDomains,safe:true,timeout:10000})
  })
  if (!response.ok) throw new Error('Reference search failed')
  const {data}=webResponse.parse(JSON.parse(new TextDecoder().decode(await boundedBody(response,128*1024))))
  return (data.web ?? []).flatMap(row=>{
    const source=sourceLink(row.url)
    if (!source) return []
    const host=new URL(source).hostname
    if (!referenceDomains.some(domain=>host===domain || host.endsWith('.'+domain))) return []
    return [{source,label:(row.title || host).slice(0,180),excerpt:row.description?.slice(0,500),attribution:'Catalog web search'}]
  })
}

function externalCrop(photos:CoinImage[]) {
  return photos.flatMap(photo=>{
    if (photo.mime!=='image/jpeg') return []
    try {
      const bytes=cropCoinJpeg(photo.bytes,true)
      return bytes ? [{bytes,mime:photo.mime}] : []
    } catch { return [] }
  })
}

async function research(env:Env,user:string,provider:string,find:()=>Promise<ScanLead[]>):Promise<ProviderResult> {
  try {
    await limit(env,provider,user,25)
    await limit(env,provider,'global',300)
    return {status:'complete',leads:await find()}
  } catch { return {status:'unavailable',leads:[]} }
}

async function photoSearchAllowed(env:Env,user:string) {
  const row=await one<{external_photo_search:number}>(env,
    'SELECT external_photo_search FROM users WHERE id=? AND deleting=0',user)
  return row?.external_photo_search===1
}

export async function researchScan(env:Env,user:string,entry:Observation|undefined,photos:CoinImage[],
  mayContinue:()=>Promise<boolean>,request:typeof fetch=fetch):Promise<ScanResult> {
  const query=scanQuery(entry)
  const isCoin=entry?.type!=='banknote'
  const allowed=isCoin && await photoSearchAllowed(env,user)
  const cropped=allowed ? externalCrop(photos) : []
  const [front,back]=cropped
  const omitted=(status:ProviderStatus):ProviderResult=>({status,leads:[]})
  const [specialist,text]=await Promise.all([
    front && !entry?.visibleDate ? research(env,user,'syllogeum',async()=>(await searchSyllogeum([front,back],request)).matches) :
      omitted(allowed && !front ? 'needs_crop' : 'disabled'),
    query && env.FIRECRAWL_API_KEY ? research(env,user,'coin_references',()=>textReferences(query,env.FIRECRAWL_API_KEY!,request)) :
      omitted(query ? 'unavailable' : 'disabled')
  ])
  const firstPass=rankScanLeads([...specialist.leads,...text.leads],entry)
  // Corroboration on both sides avoids a broad search when a specialist reference already explains the design.
  const distinctive=firstPass.filter(hit=>hit.obverse && hit.reverse && !hit.conflicts?.length && (hit.supports?.length ?? 0)>=4)
  const corroborated=!!entry?.details?.obverse && !!entry.details.reverse && photos.length>=2 && distinctive.length===1
  let google=omitted('disabled')
  if (!corroborated && front && await mayContinue() && await photoSearchAllowed(env,user)) {
    const key=env.GOOGLE_VISION_API_KEY?.trim()
    google=key ? await research(env,user,'google_vision',async()=>(await searchGoogleVision([front,back],key,request)).matches) :
      omitted('unavailable')
  } else if (!corroborated && allowed && !front) google=omitted('needs_crop')
  const leads=rankScanLeads([...firstPass,...google.leads],entry)
  const next=photos.length===1 ? 'Add the other side to narrow the match.' :
    !entry ? 'Try a closer photo with the full item in focus.' :
    !entry.visibleDate && isCoin ? 'Add a close-up of the clearest lettering or design.' :
    'Check the date, denomination and issuing authority in the photos.'
  return {stage:'complete',leads,providers:{syllogeum:specialist.status,references:text.status,google:google.status},next}
}
