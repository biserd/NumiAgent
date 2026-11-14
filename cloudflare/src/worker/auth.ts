import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { all, body, digest, fail, isLocal, limit, now, one, router, run, sameOrigin, token, uid, usageWindow } from './core'
import type { Env, WebContext } from './core'
import { id } from '../shared/domain'
import { requireChallenge } from './challenge'

const cookie = (env: Env) => isLocal(env) ? 'numis_session' : '__Host-numis_session'
const options = (env: Env) => ({ path: '/', httpOnly: true, sameSite: 'Lax' as const, secure: !isLocal(env) })
const lifetime = 30 * 86400

export async function currentUser(c: WebContext) {
  const raw = getCookie(c, cookie(c.env))
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null
  return one<{id: string; email: string; session: string}>(c.env, `SELECT u.id,u.email,s.id AS session FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.deleting=0`, await digest(raw), now())
}
async function signIn(c: WebContext, user: string) {
  const raw = token()
  const old = await currentUser(c)
  if (old) await run(c.env,'DELETE FROM sessions WHERE id=?',old.session)
  await run(c.env,'INSERT INTO sessions VALUES(?,?,?,?,?)',uid(),await digest(raw),user,now(),now()+lifetime)
  setCookie(c, cookie(c.env), raw, { ...options(c.env), maxAge: lifetime })
}
const auth = router()
auth.get('/config', c => c.json({ turnstile: c.env.TURNSTILE_SITE_KEY || null, local: isLocal(c.env) }))
auth.post('/request', async c => {
  sameOrigin(c)
  const input = await body(c,z.object({email:z.email().max(250),challenge:z.string().max(2048).optional()}))
  const email = input.email.trim().toLowerCase()
  const local = isLocal(c.env)
  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  await limit(c.env,'login_ip', await digest(ip), 15, 3600)
  if (!local && (!c.env.EMAIL || !c.env.EMAIL_FROM)) fail(503,'Sign-in service is unavailable')
  await requireChallenge(c,'login',input.challenge)
  try { await limit(c.env,'login_email',await digest(email), 5, 3600) }
  catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 429) return c.json({accepted:true},202)
    throw error
  }
  const raw = token()
  const key = await digest(raw)
  await run(c.env,'INSERT INTO login_links VALUES(?,?,?)',key,email,now()+600)
  const url = new URL('/app#signin=' + raw,c.env.APP_ORIGIN).href
  if (local) return c.json({accepted:true, developmentLink:url},202)
  c.executionCtx.waitUntil(c.env.EMAIL!.send({from:{email:c.env.EMAIL_FROM!,name:'NumiAgent'},to:email,subject:'Your NumiAgent sign-in link',
    text:'Open this link to sign in. It expires in 10 minutes.\n\n' + url}).catch(async () => {
    console.warn('Magic link delivery failed')
    await run(c.env,'DELETE FROM login_links WHERE token=?',key)
  }))
  return c.json({accepted:true},202)
})
auth.post('/verify', async c => {
  sameOrigin(c)
  const input = await body(c,z.object({token:z.string().regex(/^[0-9a-f]{64}$/)}))
  await limit(c.env,'login_verify',await digest(c.req.header('CF-Connecting-IP') ?? 'local'),60,3600)
  const record = await one<{ email:string }>(c.env,'DELETE FROM login_links WHERE token=? AND expires>? RETURNING email',await digest(input.token),now())
  if (!record) return fail(400,'This sign-in link has expired or was already used')
  const result = await one<{id:string; deleting:number}>(c.env,`INSERT INTO users(id,email,created) VALUES(?,?,?)
    ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id,deleting`,uid(),record.email,now())
  if (!result || result.deleting) return fail(409,'Account deletion is in progress')
  await run(c.env,`INSERT INTO collections(id,user_id,name,created)
    SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM collections WHERE user_id=?)`,uid(),result.id,'My collection',now(),result.id)
  await signIn(c,result.id)
  return c.json({signedIn:true})
})

export async function deleteAccount(env: Env, user: string) {
  let cursor: string | undefined
  do {
    const page = await env.PHOTOS.list({prefix:user + '/', cursor, limit:500})
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map(object => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_links WHERE email=(SELECT email FROM users WHERE id=?)').bind(user),
    env.DB.prepare('DELETE FROM limits WHERE subject=?').bind(user),
    env.DB.prepare('DELETE FROM users WHERE id=? AND deleting=1').bind(user)
  ])
}
export const profile = router()
profile.get('/', c => c.json({id:c.get('user').id,email:c.get('user').email}))
profile.get('/usage',async c=>{
  const meters = await all<{action:string;count:number}>(c.env,
    "SELECT action,count FROM limits WHERE subject=? AND window=? AND action IN ('upload_requests','ai','market')",c.get('user').id,usageWindow())
  return c.json({
    resetsAt:new Date((usageWindow()+86400)*1000).toISOString(),
    meters:Object.entries({upload_requests:650,ai:Number(c.env.AI_PER_USER),market:Number(c.env.MARKET_PER_USER ?? 30)})
      .map(([action,limit])=>({action,limit,used:meters.find(m=>m.action===action)?.count ?? 0}))
  })
})
profile.get('/sessions',async c => c.json(await all(c.env,
  'SELECT id,created,expires,id=? AS current FROM sessions WHERE user_id=? AND expires>? ORDER BY created DESC',c.get('user').session,c.get('user').id,now())))
profile.delete('/sessions/:id',async c => {
  const key = id.safeParse(c.req.param('id'))
  if (!key.success) return fail(404,'Session unavailable')
  await run(c.env,'DELETE FROM sessions WHERE id=? AND user_id=?',key.data,c.get('user').id)
  if (key.data === c.get('user').session) deleteCookie(c,cookie(c.env),options(c.env))
  return c.body(null,204)
})
profile.post('/signout',async c => {
  await run(c.env,'DELETE FROM sessions WHERE id=?',c.get('user').session)
  deleteCookie(c,cookie(c.env),options(c.env))
  return c.body(null,204)
})
profile.delete('/',async c => {
  await body(c,z.object({confirm:z.literal('DELETE')}))
  const user = c.get('user').id
  await run(c.env,'UPDATE users SET deleting=1 WHERE id=?',user)
  deleteCookie(c,cookie(c.env),options(c.env))
  return c.json({deletion:'scheduled'},202)
})
profile.get('/export',async c => {
  const tables = ['collections','items','item_photos','imports','photos','sales','valuation_history','themes','watchlists','audit','oauth_consents']
  const data = await c.env.DB.batch(tables.map(table => c.env.DB.prepare('SELECT * FROM ' + table + ' WHERE user_id=?').bind(c.get('user').id)))
  return c.json({account:{email:c.get('user').email}, ...Object.fromEntries(tables.map((table,i)=>[table,data[i].results]))},
    200, {'Content-Disposition':'attachment; filename="numiagent.json"'})
})
export { auth }
