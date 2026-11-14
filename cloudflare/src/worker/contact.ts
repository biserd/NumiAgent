import { contactInput } from '../shared/domain'
import { body, digest, limit, now, run, sameOrigin, uid } from './core'
import type { WebContext } from './core'
import { requireChallenge } from './challenge'

export const contactRetentionDays = 90
export async function submitContact(c:WebContext) {
  sameOrigin(c)
  const input=await body(c,contactInput)
  const ip=c.req.header('CF-Connecting-IP') ?? 'local'
  await limit(c.env,'contact_ip',await digest(ip),8,3600)
  await requireChallenge(c,'contact',input.challenge)
  await limit(c.env,'contact','global',300)
  const reference=uid()
  await run(c.env,'INSERT INTO contact_messages(id,email,topic,message,created) VALUES(?,?,?,?,?)',
    reference,input.email.trim(),input.topic,input.message,now())
  return c.json({reference},201)
}
