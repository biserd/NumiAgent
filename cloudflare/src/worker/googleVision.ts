import { z } from 'zod'
import { boundedBody } from './core.ts'
import { coinSearchBytes, sourceLink } from './visualSearch.ts'
import type { CoinImage, CoinImages } from './visualSearch.ts'

const page = z.object({url:z.string(),pageTitle:z.string().optional()})
const maxResults = 10
const annotation = z.object({
  error:z.unknown().optional(),
  webDetection:z.object({pagesWithMatchingImages:z.array(z.unknown()).max(50).optional(),
    visuallySimilarImages:z.array(z.unknown()).max(50).optional()}).optional()
})

async function annotatePhoto(photo:CoinImage,key:string,request:typeof fetch) {
  // Two base64-encoded uploads can exceed Cloud Vision's 10 MB JSON limit.
  const requests=[{
    image:{content:Buffer.from(coinSearchBytes(photo)).toString('base64')},
    features:[{type:'WEB_DETECTION',maxResults}]
  }]
  const response=await request('https://vision.googleapis.com/v1/images:annotate',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({requests})
  })
  if (!response.ok) throw new Error('Google Cloud Vision request failed')
  const bytes=await boundedBody(response,256*1024)
  const {responses:[result]}=z.object({responses:z.tuple([annotation])})
    .parse(JSON.parse(new TextDecoder().decode(bytes)))
  if (result.error) throw new Error('Google Cloud Vision could not process this photo')
  return result
}

export async function searchGoogleVision(images:CoinImages,key:string,request:typeof fetch=fetch) {
  const photos=images.filter((photo):photo is CoinImage=>!!photo)
  const results=await Promise.allSettled(photos.map(photo=>annotatePhoto(photo,key,request)))
  const completed=results.flatMap(result=>result.status==='fulfilled' ? [result.value] : [])
  if (!completed.length) throw new Error('Google Cloud Vision could not process these photos')
  const matches=new Map<string,{source:string;label:string;attribution:string;obverse:string;reverse:string}>()
  for (let rank=0;rank<maxResults && matches.size<5;rank++) {
    for (const entry of completed) {
      const hit=page.safeParse(entry.webDetection?.pagesWithMatchingImages?.[rank])
      if (!hit.success) continue
      const source=sourceLink(hit.data.url)
      if (!source || matches.has(source)) continue
      const label=hit.data.pageTitle?.replace(/<[^>]*>/g,'').trim().slice(0,180) || new URL(source).hostname
      matches.set(source,{source,label,attribution:'Google Cloud Vision',obverse:'',reverse:''})
    }
  }
  if (!matches.size) {
    for (const entry of completed) {
      for (const raw of entry.webDetection?.visuallySimilarImages?.slice(0,3) ?? []) {
        const hit=page.safeParse(raw)
        const source=hit.success ? sourceLink(hit.data.url) : undefined
        if (!source || matches.has(source)) continue
        matches.set(source,{source,label:'Similar image · '+new URL(source).hostname,attribution:'Google Cloud Vision',obverse:'',reverse:''})
      }
    }
  }
  if (!matches.size && completed.length!==photos.length) throw new Error('Google Cloud Vision did not complete both searches')
  return {photoCount:completed.length,matches:[...matches.values()].slice(0,5)}
}
