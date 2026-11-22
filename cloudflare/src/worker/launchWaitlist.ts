import { z } from 'zod'
import { body, digest, fail, isLocal, limit, now, one, router, run, sameOrigin, token } from './core'
import { requireChallenge } from './challenge'

const waitlist = router()
const day = 86400
export const waitlistRetentionDays = 365
const signup = z.object({email:z.email().max(250),challenge:z.string().max(2048).optional()})
const manage = z.object({token:z.string().regex(/^[a-f0-9]{64}$/),action:z.enum(['confirm','unsubscribe'])})

waitlist.post('/',async c=>{
  sameOrigin(c)
  if (c.env.APP_STORE_AVAILABLE==='true') return fail(409,'NumiAgent is now available on the App Store. Reload for the download link.')
  const input = await body(c,signup)
  const email = input.email.toLowerCase()
  await limit(c.env,'waitlist_ip',await digest(c.req.header('CF-Connecting-IP') ?? 'local'),12,3600)
  await requireChallenge(c,'launch_waitlist',input.challenge)
  await limit(c.env,'waitlist_global','global',200,3600)
  const local = isLocal(c.env)
  if (!local && (!c.env.EMAIL || !c.env.EMAIL_FROM)) return fail(503,'Launch email is temporarily unavailable')

  const time = now()
  const raw = token()
  const hash = await digest(raw)
  const entry = await one<{email:string}>(c.env,`INSERT INTO launch_waitlist (email,token_hash,requested_at)
    VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,requested_at=excluded.requested_at
    WHERE launch_waitlist.confirmed_at IS NULL AND launch_waitlist.requested_at<=? RETURNING email`,
  email,hash,time,time-600)
  if (!entry) return c.json({accepted:true},202)

  const confirmation = new URL('/launch-email#confirm='+raw,c.env.APP_ORIGIN).href
  const removal = new URL('/launch-email#unsubscribe='+raw,c.env.APP_ORIGIN).href
  if (local) return c.json({accepted:true,confirmation,removal},202)
  try {
    await c.env.EMAIL!.send({
      from:{email:c.env.EMAIL_FROM!,name:'NumiAgent'},to:email,subject:'Confirm your NumiAgent launch notification',
      text:`Confirm that you want an email when NumiAgent is available on the App Store. This link expires in 24 hours.\n\n${confirmation}\n\nIf you did not request this, you can ignore this email or remove your address here.\n\n${removal}`
    })
  } catch {
    await run(c.env,'DELETE FROM launch_waitlist WHERE token_hash=? AND confirmed_at IS NULL',hash)
    return fail(503,'We couldn’t send the confirmation email. Please try again.')
  }
  return c.json({accepted:true},202)
})

waitlist.post('/manage',async c=>{
  sameOrigin(c)
  const input = await body(c,manage)
  await limit(c.env,'waitlist_manage_ip',await digest(c.req.header('CF-Connecting-IP') ?? 'local'),40,3600)
  const hash = await digest(input.token)
  if (input.action==='unsubscribe') {
    await run(c.env,'DELETE FROM launch_waitlist WHERE token_hash=?',hash)
    return c.json({status:'unsubscribed'})
  }
  const time = now()
  const result = await one<{confirmed_at:number}>(c.env,`UPDATE launch_waitlist SET confirmed_at=COALESCE(confirmed_at,?)
    WHERE token_hash=? AND (confirmed_at IS NOT NULL OR requested_at>?) RETURNING confirmed_at`,time,hash,time-day)
  if (!result) return fail(400,'This confirmation link is no longer valid. Request a new one on the homepage.')
  return c.json({status:'confirmed'})
})

export { waitlist }
