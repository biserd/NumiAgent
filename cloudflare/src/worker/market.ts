import { z } from 'zod'
import { https, normalize, text } from '../shared/domain'
import { all, body, fail, limit, now, one, router, run, uid } from './core'
import { themeProgress, watchedThemes } from './collection'
import { canonicalLot, newAuctionAlerts } from './auctionAlerts'
import type { Env } from './core'
import { ebayEnabled, searchEbay } from './ebay'

const querySchema = z.string().trim().min(2).max(180)
const hit = z.object({
  url:https,title:text.min(1),description:z.string().max(1000).optional(),
  auctionHouse:text.optional(),auction:text.optional(),lot:text.optional(),
  state:z.enum(['active','closed','unknown']).default('unknown'),
  closesAt:z.iso.datetime({offset:true}).optional(), verifiedAt:z.iso.datetime({offset:true}).optional(),
  price:z.object({kind:z.enum(['asking','estimate','current_bid']),amount:z.number().nonnegative(),
    currency:z.string().regex(/^[A-Z]{3}$/),premium:z.number().min(0).max(100).optional()}).optional()
})
export type Hit = z.infer<typeof hit>
const firecrawlResponse = z.object({success:z.literal(true),
  data:z.object({web:z.array(z.object({url:z.string(),title:z.string().optional(),description:z.string().optional()})).optional()})})
const domains = (env:Env) => (env.MARKET_DOMAINS ?? '').split(',').map(v=>v.trim().toLowerCase()).filter(v=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v))
function unique(results: Hit[], allowed:string[]) {
  const keys = new Set<string>()
  return results.filter(entry=>{
    const host = new URL(entry.url).hostname
    if (!allowed.some(domain=>host===domain || host.endsWith('.'+domain))) return false
    const url = canonicalLot(entry.url).url
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
  const ebay=ebayEnabled(env)
  const retrievedAt = new Date().toISOString()
  const results:Hit[] = []
  const coverage:{provider:string;status:string;domains:string[]}[] = []
  if (!ebay && (!allowed.length || (!env.FIRECRAWL_API_KEY && !env.MARKET_FEED_URL))) return {status:'unavailable',query,retrievedAt,coverage,results}
  await limit(env,'market',user,Number(env.MARKET_PER_USER ?? 30))
  await limit(env,'market','global',Number(env.MARKET_GLOBAL ?? 300))
  if (allowed.length && env.MARKET_FEED_URL) {
    const entry = {provider:'authorized_feed',domains:allowed,status:'unavailable'}
    coverage.push(entry)
    try {
      const target = new URL(https.parse(env.MARKET_FEED_URL))
      target.searchParams.set('q',query)
      const response = await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(8000),
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
  if (allowed.length && env.FIRECRAWL_API_KEY) {
    const entry = {provider:'firecrawl',domains:allowed,status:'unavailable'}
    coverage.push(entry)
    try {
      const response = await fetch('https://api.firecrawl.dev/v2/search',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
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
  if(ebay){
    const entry={provider:'ebay_browse_us',domains:['ebay.com'],status:'unavailable'}
    coverage.push(entry)
    try {
      results.push(...await searchEbay(env,query,retrievedAt))
      entry.status='queried'
    } catch { console.warn('Approved eBay Browse provider unavailable') }
  }
  const deduped = unique(results.sort((a,b)=>Number(b.state==='active')-Number(a.state==='active')),ebay?[...allowed,'ebay.com']:allowed)
  const active = deduped.some(r=>r.state==='active')
  const status = active ? 'active_results' : coverage.some(c=>c.status==='queried') ? 'insufficient_verified_coverage':'unavailable'
  return {status,query,retrievedAt,coverage,results:deduped}
}

export const market = router()
function capabilities(env:Env) {
  const allowed = domains(env)
  const activeFeed = !!env.MARKET_FEED_URL && allowed.length>0
  const ebay = ebayEnabled(env)
  const biddrDiscovery = !!env.FIRECRAWL_API_KEY && allowed.some(d=>d==='biddr.com' || d.endsWith('.biddr.com'))
  return {activeFeed,ebay,biddrDiscovery,emailAlerts:!!(env.EMAIL && env.EMAIL_FROM && (activeFeed || ebay || biddrDiscovery))}
}
market.get('/capabilities',c=>c.json(capabilities(c.env)))
market.get('/search',async c=>{
  const query = querySchema.safeParse(c.req.query('q'))
  if (!query.success) return c.json({error:'Enter an auction search query'},400)
  return c.json(await marketSearch(c.env,c.get('user').id,query.data))
})
type Gap = {id:string;themeId:string;slotKey:string;query:string;alert:number;checked:number|null}
type Watch = {id:string;user_id:string;email:string;query:string;seen:string;themeId:string|null;slotKey:string|null}
export const watchlists = router()
watchlists.get('/',async c=>{
  const user = c.get('user').id
  const saved = await all(c.env,'SELECT id,query,alert,checked FROM watchlists WHERE user_id=? ORDER BY query',user)
  const gaps = await all<Gap>(c.env,'SELECT id,theme_id AS themeId,slot_key AS slotKey,query,alert,checked FROM gap_watches WHERE user_id=? ORDER BY query',user)
  const lists = new Map((gaps.length ? await watchedThemes(c.env,user) : []).map(list=>[list.id,list]))
  return c.json([...saved,...gaps.map(g=>{
    const list=lists.get(g.themeId)
    const slot=list?.slots.find(s=>s.slotKey===g.slotKey)
    return {...g,theme:list?.name,state:!slot?'rule_changed':slot.owned.length?'filled':'watching'}
  })])
})
watchlists.post('/gap',async c=>{
  const input = await body(c,z.object({themeId:z.uuid(),slotKey:z.string().regex(/^[a-f0-9]{64}$/),alert:z.boolean().optional()}))
  const user = c.get('user').id
  await limit(c.env,'gap_watch',user,100)
  const list = await themeProgress(c.env,user,input.themeId)
  const slot = list.slots.find(s=>s.slotKey===input.slotKey)
  if (!slot || slot.owned.length) return fail(409,'This checklist gap is no longer missing')
  if (input.alert && !capabilities(c.env).emailAlerts) return fail(409,'Automatic email alerts are unavailable. Save this watch with email off.')
  const result = await one<{id:string}>(c.env,`INSERT INTO gap_watches(id,user_id,theme_id,slot_key,query,alert)
    VALUES(?,?,?,?,?,COALESCE(?,0)) ON CONFLICT(user_id,theme_id,slot_key)
    DO UPDATE SET query=excluded.query,alert=COALESCE(?,gap_watches.alert) RETURNING id`,
    uid(),user,input.themeId,slot.slotKey,slot.query,input.alert==null?null:Number(input.alert),input.alert==null?null:Number(input.alert))
  return c.json(result,201)
})
watchlists.post('/',async c=>{
  const input = await body(c,z.object({query:querySchema,alert:z.boolean().default(false)}))
  const user = c.get('user').id
  await limit(c.env,'watch_create',user,25)
  await run(c.env,`INSERT INTO watchlists(id,user_id,query,alert) VALUES(?,?,?,?)
    ON CONFLICT(user_id,query) DO UPDATE SET alert=excluded.alert`,uid(),user,input.query,Number(input.alert))
  return c.json(input,201)
})
watchlists.delete('/:id',async c=>{
  const args=[c.req.param('id'),c.get('user').id]
  await c.env.DB.batch(['watchlists','gap_watches'].map(table=>c.env.DB.prepare('DELETE FROM '+table+' WHERE id=? AND user_id=?').bind(...args)))
  return c.body(null,204)
})
export async function refreshWatchlists(env:Env) {
  const caps = capabilities(env)
  if (!caps.emailAlerts || !env.EMAIL || !env.EMAIL_FROM) return
  const watches = await all<Watch>(env,`SELECT w.*,u.email FROM (
    SELECT id,user_id,query,seen,checked,NULL AS themeId,NULL AS slotKey FROM watchlists WHERE alert=1 AND ?=1
    UNION ALL SELECT id,user_id,query,seen,checked,theme_id,slot_key FROM gap_watches WHERE alert=1
    ) w JOIN users u ON u.id=w.user_id WHERE u.deleting=0 AND COALESCE(w.checked,0)<? ORDER BY COALESCE(w.checked,0),w.id LIMIT 12`,
    Number(caps.activeFeed || caps.ebay),now()-86400)
  for (const watch of watches) {
    const table = watch.themeId ? 'gap_watches' : 'watchlists'
    const missing = async()=>!watch.themeId || (await themeProgress(env,watch.user_id,watch.themeId)).missing.some(s=>s.slotKey===watch.slotKey)
    try {
      // Move the attempt behind the remaining due watches, even if a provider is down.
      const claimed=await run(env,'UPDATE '+table+' SET checked=? WHERE id=? AND user_id=? AND alert=1 AND COALESCE(checked,0)<?',
        now(),watch.id,watch.user_id,now()-86400)
      if (!claimed.meta.changes) continue
      if (!await missing()) continue
      const discovery = watch.themeId && caps.biddrDiscovery
      const market = await marketSearch({...env,FIRECRAWL_API_KEY:discovery?env.FIRECRAWL_API_KEY:undefined},watch.user_id,watch.query)
      if (!market.coverage.some(c=>c.status==='queried')) continue
      const previouslySeen = JSON.parse(watch.seen) as string[]
      const news = newAuctionAlerts(market.results,previouslySeen,!!discovery)
      if (!news.length || !await missing()) continue
      const enabled = await one(env,'SELECT 1 FROM '+table+' w JOIN users u ON u.id=w.user_id WHERE w.id=? AND w.user_id=? AND w.alert=1 AND u.deleting=0',watch.id,watch.user_id)
      if (!enabled) continue
      await env.EMAIL.send({
        to:watch.email,from:env.EMAIL_FROM,subject:'New auction matches',
        text:watch.query+'\n\n'+news.map(({hit,label})=>label+'\n'+hit.title+'\n'+hit.url).join('\n\n')+'\n\nManage alerts at '+env.APP_ORIGIN+'/app'
      })
      const seen = [...new Set([...news.map(row=>row.key),...previouslySeen])].slice(0,100)
      await run(env,'UPDATE '+table+' SET seen=? WHERE id=? AND user_id=?',JSON.stringify(seen),watch.id,watch.user_id)
    } catch {console.warn('Watch refresh failed')}
  }
}
