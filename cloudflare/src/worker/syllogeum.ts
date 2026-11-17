import { z } from 'zod'
import { boundedBody } from './core.ts'
import { coinSearchBytes, sourceLink } from './visualSearch.ts'
import type { CoinImage, CoinImages } from './visualSearch.ts'

const endpoint = 'https://syllogeum.org/search'
const result = z.object({
  type_label:z.string().trim().min(1).max(300),
  type_url:z.string().nullish(),
  source_url:z.string().nullish(),
  attribution:z.string().trim().max(300).nullish(),
  type_card:z.object({
    obv_desc:z.string().trim().max(1000).nullish(),
    rev_desc:z.string().trim().max(1000).nullish()
  }).nullish(),
  score:z.number().finite()
})

async function search(obverse:Blob|undefined,reverse:Blob|undefined,request:typeof fetch) {
  const body=new FormData()
  if (obverse) body.append('obverse',obverse,'obverse')
  if (reverse) body.append('reverse',reverse,'reverse')
  body.append('k','20')
  const response=await request(endpoint,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(15000)})
  if (!response.ok) throw new Error('Syllogeum request failed')
  const bytes=await boundedBody(response,256*1024)
  const {results}=z.object({results:z.array(z.unknown()).max(20)}).parse(JSON.parse(new TextDecoder().decode(bytes)))
  return results.flatMap(entry=>{
    const parsed=result.safeParse(entry)
    if (!parsed.success) return []
    const hit=parsed.data
    const source=sourceLink(hit.type_url) ?? sourceLink(hit.source_url)
    if (!source) return []
    return [{source,label:hit.type_label,attribution:hit.attribution ?? '',obverse:hit.type_card?.obv_desc ?? '',
      reverse:hit.type_card?.rev_desc ?? '',score:hit.score}]
  })
}

export async function searchSyllogeum(images:CoinImages,request:typeof fetch=fetch) {
  const prepare=(image:CoinImage)=>new Blob([new Uint8Array(coinSearchBytes(image))],{type:image.mime})
  const front=prepare(images[0])
  const back=images[1] ? prepare(images[1]) : undefined
  const searches=await Promise.allSettled([search(front,back,request),search(back,front,request)])
  const hits=searches.flatMap(entry=>entry.status==='fulfilled' ? entry.value : []).sort((a,b)=>b.score-a.score)
  if (!hits.length && searches.some(entry=>entry.status==='rejected')) throw new Error('Syllogeum search unavailable')
  const unique=new Set<string>()
  const matches=hits.filter(hit=>{
    if (unique.has(hit.source)) return false
    unique.add(hit.source)
    return true
  }).slice(0,5).map(({score:_score,...hit})=>hit)
  return {photoCount:back ? 2 : 1,matches}
}
