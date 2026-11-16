import { z } from 'zod'
import { https, normalize, sale, text } from '../shared/domain'
import { boundedBody, limit } from './core'
import type { Env } from './core'
import type { Item } from '../shared/domain'

const feedSale=sale.omit({sourceChecked:true}).extend({reference:text.min(1)})
const feed=z.array(z.unknown()).max(50)

export async function researchSales(env:Env,user:string,specimen:Item) {
  const checkedAt=new Date().toISOString()
  const unavailable={status:'unavailable',checkedAt,results:[]}
  const hosts=(env.SALE_SOURCE_DOMAINS ?? '').split(',').map(host=>host.trim().toLowerCase())
    .filter(host=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host))
  if(!env.SALE_FEED_URL || !hosts.length) return {...unavailable,status:'provider_not_configured'}
  if(!specimen.reference.trim()) return {...unavailable,status:'reference_required'}
  const provider=https.safeParse(env.SALE_FEED_URL)
  if(!provider.success) return unavailable
  await limit(env,'sale_research',user,20)
  await limit(env,'sale_research','global',200)
  const target=new URL(provider.data)
  target.searchParams.set('reference',specimen.reference)
  target.searchParams.set('type',specimen.type)
  try{
    const response=await fetch(target,{headers:env.SALE_FEED_TOKEN ? {Authorization:'Bearer '+env.SALE_FEED_TOKEN}:undefined,
      signal:AbortSignal.timeout(7500),redirect:'manual'})
    if(!response.ok) return unavailable
    const rows=feed.parse(JSON.parse(new TextDecoder().decode(await boundedBody(response,192*1024))))
    const expected=normalize(specimen.reference)
    const seen=new Set<string>()
    const results=rows.flatMap(raw=>{
      const row=feedSale.safeParse(raw).data
      if(!row || !expected || normalize(row.reference)!==expected || row.date>checkedAt.slice(0,10)) return []
      const host=new URL(row.url).hostname
      if(!hosts.some(domain=>host===domain || host.endsWith('.'+domain))) return []
      const key=[row.house,row.auction,row.lot].map(normalize).join('|')
      if(seen.has(key)) return []
      seen.add(key)
      return [{...row,match:'possible' as const}]
    })
    return {status:results.length?'results':'no_matches',checkedAt,results}
  } catch {
    console.warn('Approved realized-sale feed unavailable')
    return unavailable
  }
}
