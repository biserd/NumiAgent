import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { referenceKinds, searchReferences } from '../shared/references'
import { agentRequest, grants } from './agent'
import { auth, currentUser, deleteAccount, profile } from './auth'
import { contactRetentionDays, submitContact } from './contact'
import { collections, items, themes, valuations } from './collection'
import { all, fail, limit, now, router, run, sameOrigin, usageWindow } from './core'
import type { Env, Job } from './core'
import { authorizeDeveloper, developerKeys } from './developer'
import { imports, photos, processQueue, reconcileImports } from './ingest'
import { market, refreshWatchlists, watchlists } from './market'
import { publicPage } from './publicSite'
export { PhotoWorkflow } from './ingest'

const api = router()
api.get('/health',c=>c.json({ok:true}))
api.route('/auth',auth)
api.post('/contact',submitContact)
api.use('*',async(c,next)=>{
  const authorization = c.req.header('Authorization')
  if (authorization !== undefined) return authorizeDeveloper(c,authorization,next)
  const user = await currentUser(c)
  if (!user) return fail(401,'Sign in to continue')
  c.set('user',user)
  if (!['GET','HEAD'].includes(c.req.method)) {
    sameOrigin(c)
    await limit(c.env,'api_write',user.id,1600)
  }
  await next()
})
profile.route('/grants',grants)
profile.route('/developer-keys',developerKeys)
api.route('/me',profile)
api.route('/items',items)
api.route('/collections',collections)
api.route('/imports',imports)
api.route('/photos',photos)
api.route('/themes',themes)
api.route('/valuations',valuations)
api.route('/market',market)
api.route('/watchlists',watchlists)
api.get('/references',c=>{
  const query = z.object({q:z.string().trim().min(2).max(180),kind:z.enum(referenceKinds).optional()}).safeParse(c.req.query())
  if (!query.success) return fail(400,'Enter a reference term and optional ruler, mint, denomination, or metal kind')
  return c.json(searchReferences(query.data.q,query.data.kind))
})
const app = router()
app.route('/api/v1',api)
app.onError((error,c)=>{
  if (error instanceof HTTPException) return c.json({error:error.message},error.status)
  console.error('Worker application request failed',{kind:error.name})
  return c.json({error:'The request could not be completed'},500)
})

export default {
  async fetch(request,env,ctx) {
    const url = new URL(request.url)
    if (url.origin!==env.APP_ORIGIN) return new Response('Unrecognized origin',{status:421})
    const isApi = url.pathname.startsWith('/api/')
    const isAgent = url.pathname==='/mcp' || url.pathname.startsWith('/oauth/') ||
      url.pathname==='/.well-known/oauth-authorization-server' || url.pathname.startsWith('/.well-known/oauth-protected-resource')
    const origin = request.headers.get('Origin')
    if (url.pathname==='/mcp' && origin && origin!==env.APP_ORIGIN) return new Response('Origin rejected',{status:403})
    let response: Response
    try {
      if (isApi) response = await app.fetch(request,env,ctx)
      else if (isAgent) response = await agentRequest(request,env,ctx)
      else response = await publicPage(request,url,env) ?? await env.ASSETS.fetch(request)
    } catch (error) {
      const status = error instanceof HTTPException ? error.status : 500
      response = Response.json({error:status===500 ? 'The request could not be completed':(error as Error).message},{status})
    }
    const headers = new Headers(response.headers)
    headers.set('X-Frame-Options','DENY')
    headers.set('X-Content-Type-Options','nosniff')
    headers.set('Referrer-Policy','no-referrer')
    if (isApi || isAgent) headers.set('Cache-Control','no-store')
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
  },
  queue(batch,env) { return processQueue(env,batch) },
  scheduled(_event,env,ctx) { ctx.waitUntil(maintenance(env)) }
} satisfies ExportedHandler<Env,Job>

async function maintenance(env:Env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_links WHERE expires<?').bind(now()),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now()),
    env.DB.prepare('DELETE FROM developer_keys WHERE expires<=?').bind(now()),
    env.DB.prepare('DELETE FROM limits WHERE window<?').bind(now()-8*86400),
    env.DB.prepare('DELETE FROM contact_messages WHERE created<?').bind(now()-contactRetentionDays*86400)
  ])
  for (const user of await all<{id:string}>(env,'SELECT id FROM users WHERE deleting=1 LIMIT 20')) {
    try { await deleteAccount(env,user.id) } catch { console.error('Account deletion will retry') }
  }
  const abandoned = await all<{id:string;user_id:string}>(env,"SELECT id,user_id FROM photos WHERE state='uploading' AND updated<? LIMIT 100",now()-86400)
  for (const p of abandoned) {
    const removed = await run(env,"DELETE FROM photos WHERE id=? AND state='uploading' AND updated<?",p.id,now()-86400)
    if (removed.meta.changes) await env.PHOTOS.delete(p.user_id+'/'+p.id)
  }
  await reconcileImports(env)
  await refreshWatchlists(env)
  await notifyBudget(env)
}

async function notifyBudget(env:Env) {
  if (!env.BUDGET_ALERT_EMAIL || !env.EMAIL || !env.EMAIL_FROM) return
  const usage = await all<{action:string;count:number}>(env,
    "SELECT action,count FROM limits WHERE subject='global' AND window=? AND action IN ('ai','market')",usageWindow())
  const caps = new Map([['ai',Number(env.AI_GLOBAL)],['market',Number(env.MARKET_GLOBAL ?? 300)]])
  const over = usage.filter(meter=>meter.count >= .8*(caps.get(meter.action) ?? Infinity))
  if (!over.length) return
  const claimed = await run(env,"INSERT INTO limits VALUES('budget_alert','global',?,1) ON CONFLICT DO NOTHING",usageWindow())
  if (!claimed.meta.changes) return
  try {
    await env.EMAIL.send({to:env.BUDGET_ALERT_EMAIL,from:env.EMAIL_FROM,subject:'NumiAgent daily usage',
      text:'Usage has reached 80% of a daily limit.\n'+over.map(meter=>meter.action+': '+meter.count+'/'+caps.get(meter.action)).join('\n')})
  } catch {
    await run(env,"DELETE FROM limits WHERE action='budget_alert' AND subject='global' AND window=?",usageWindow())
    console.warn('Budget alert will retry')
  }
}
