import { z } from 'zod'
import { https, normalize, text } from '../shared/domain'
import { all, body, limit, now, router, run, uid } from './core'
import type { Env } from './core'

const querySchema = z.string().trim().min(2).max(180)
const hit = z.object({
  url:https,title:text.min(1),description:z.string().max(1000).optional(),
  auctionHouse:text.optional(),auction:text.optional(),lot:text.optional(),
  state:z.enum(['active','closed','unknown']).default('unknown'),
  closesAt:z.iso.datetime({offset:true}).optional(), verifiedAt:z.iso.datetime({offset:true}).optional(),
  price:z.object({kind:z.enum(['asking','estimate','current_bid']),amount:z.number().nonnegative(),
    currency:z.string().regex(/^[A-Z]{3}$/),premium:z.number().min(0).max(100).optional()}).optional()
})
type Hit = z.infer<typeof hit>
const firecrawlResponse = z.object({success:z.literal(true),
  data:z.object({web:z.array(z.object({url:z.string(),title:z.string().optional(),description:z.string().optional()})).optional()})})
const domains = (env:Env) => (env.MARKET_DOMAINS ?? '').split(',').map(v=>v.trim().toLowerCase()).filter(v=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v))
const canonical = (value:string) => {
  const url = new URL(value)
  url.hash=''
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return url.href
}
function unique(results: Hit[], allowed:string[]) {
  const keys = new Set<string>()
  return results.filter(entry=>{
    const host = new URL(entry.url).hostname
    if (!allowed.some(domain=>host===domain || host.endsWith('.'+domain))) return false
    const url = canonical(entry.url)
    const syndication = entry.auctionHouse && entry.auction && entry.lot
      ? [entry.auctionHouse,entry.auction,entry.lot].map(normalize).join('|') : null
    if (keys.has(url) || (syndication && keys.has(syndication))) return false
    keys.add(url)
    if (syndication) keys.add(syndication)
    return true
  })
}
export async function marketSearch(env:Env,user:string,query:string) {
  const allowed = domains(env)
  const retrievedAt = new Date().toISOString()
  const results:Hit[] = []
  const coverage:{provider:string;status:string;domains:string[]}[] = []
  if (!allowed.length || (!env.FIRECRAWL_API_KEY && !env.MARKET_FEED_URL)) return {status:'unavailable',query,retrievedAt,coverage,results}
  await limit(env,'market',user,Number(env.MARKET_PER_USER ?? 30))
  await limit(env,'market','global',Number(env.MARKET_GLOBAL ?? 300))
  if (env.MARKET_FEED_URL) {
    const entry = {provider:'authorized_feed',domains:allowed,status:'unavailable'}
    coverage.push(entry)
    try {
      const target = new URL(https.parse(env.MARKET_FEED_URL))
      target.searchParams.set('q',query)
      const response = await fetch(target,{redirect:'error',signal:AbortSignal.timeout(8000),
        headers:env.MARKET_FEED_TOKEN ? {Authorization:'Bearer '+env.MARKET_FEED_TOKEN}:undefined})
      if (!response.ok) throw new Error('Feed status')
      const payload = z.array(hit).max(50).parse(await response.json())
      results.push(...payload.map(value=>{
        const verified = Date.parse(value.verifiedAt ?? '')
        const closes = Date.parse(value.closesAt ?? '')
        const current = Number.isFinite(verified) && verified <= Date.now() && verified >= Date.now()-86400000
        const state = closes <= Date.now() ? 'closed' : current && Number.isFinite(closes) ? value.state : 'unknown'
        return {...value,state} as Hit
      }))
      entry.status = 'queried'
    } catch { console.warn('Authorized marketplace feed unavailable') }
  }
  if (env.FIRECRAWL_API_KEY) {
    const entry = {provider:'firecrawl',domains:allowed,status:'unavailable'}
    coverage.push(entry)
    try {
      const response = await fetch('https://api.firecrawl.dev/v2/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
        headers:{Authorization:'Bearer '+env.FIRECRAWL_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({query:query+' coin banknote auction lot',limit:15,includeDomains:allowed,safe:true,timeout:10000,domainTools:false})})
      if (!response.ok) throw new Error('Search status')
      const payload = firecrawlResponse.parse(await response.json())
      for (const row of payload.data.web ?? []) {
        const parsed = hit.safeParse({url:row.url,title:(row.title || 'Open auction result').slice(0,180),description:row.description?.slice(0,1000)})
        if (parsed.success) results.push(parsed.data)
      }
      entry.status = 'queried'
    } catch { console.warn('Marketplace search unavailable') }
  }
  const deduped = unique(results,allowed)
  const active = deduped.some(r=>r.state==='active')
  const status = active ? 'active_results' : coverage.some(c=>c.status==='queried') ? 'insufficient_verified_coverage':'unavailable'
  return {status,query,retrievedAt,coverage,results:deduped}
}

export const market = router()
market.get('/search',async c=>{
  const query = querySchema.safeParse(c.req.query('q'))
  if (!query.success) return c.json({error:'Enter an auction search query'},400)
  return c.json(await marketSearch(c.env,c.get('user').id,query.data))
})
type Watch = {id:string;user_id:string;email:string;query:string;seen:string;checked:number|null}
export const watchlists = router()
watchlists.get('/',async c=>c.json(await all(c.env,'SELECT id,query,alert,checked FROM watchlists WHERE user_id=? ORDER BY query',c.get('user').id)))
watchlists.post('/',async c=>{
  const input = await body(c,z.object({query:querySchema,alert:z.boolean().default(false)}))
  const user = c.get('user').id
  await limit(c.env,'watch_create',user,25)
  await run(c.env,`INSERT INTO watchlists(id,user_id,query,alert) VALUES(?,?,?,?)
    ON CONFLICT(user_id,query) DO UPDATE SET alert=excluded.alert`,uid(),user,input.query,Number(input.alert))
  return c.json(input,201)
})
watchlists.delete('/:id',async c=>{
  await run(c.env,'DELETE FROM watchlists WHERE id=? AND user_id=?',c.req.param('id'),c.get('user').id)
  return c.body(null,204)
})
export async function refreshWatchlists(env:Env) {
  if (!env.MARKET_FEED_URL || !env.EMAIL || !env.EMAIL_FROM) return
  const watches = await all<Watch>(env,`SELECT w.*,u.email FROM watchlists w JOIN users u ON u.id=w.user_id
    WHERE w.alert=1 AND u.deleting=0 AND COALESCE(w.checked,0)<? ORDER BY COALESCE(w.checked,0) LIMIT 12`,now()-86400)
  for (const watch of watches) {
    try {
      const market = await marketSearch({...env,FIRECRAWL_API_KEY:undefined},watch.user_id,watch.query)
      if (!market.coverage.some(c=>c.status==='queried')) continue
      const active = market.results.filter(r=>r.state==='active')
      const previouslySeen = JSON.parse(watch.seen) as string[]
      const news = active.filter(r=>!previouslySeen.includes(canonical(r.url)))
      const enabled = await all(env,'SELECT 1 FROM watchlists w JOIN users u ON u.id=w.user_id WHERE w.id=? AND w.alert=1 AND u.deleting=0',watch.id)
      if (enabled.length && news.length) await env.EMAIL.send({
        to:watch.email,from:env.EMAIL_FROM,subject:'New auction matches',
        text:news.slice(0,20).map(r=>r.title+'\n'+r.url).join('\n\n')+'\n\nManage alerts at '+env.APP_ORIGIN+'/app'
      })
      const seen = [...new Set([...active.map(r=>canonical(r.url)),...previouslySeen])].slice(0,100)
      await run(env,'UPDATE watchlists SET checked=?,seen=? WHERE id=? AND user_id=?',now(),JSON.stringify(seen),watch.id,watch.user_id)
    } catch {console.warn('Watch refresh failed')}
  }
}
