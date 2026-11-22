import { fail, isLocal } from './core'
import type { WebContext } from './core'

export async function requireChallenge(c:WebContext,action:'login'|'contact'|'launch_waitlist',challenge?:string) {
  if (isLocal(c.env)) return
  const secret=c.env.TURNSTILE_SECRET
  if (!secret) return fail(503,'Security check is temporarily unavailable')
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',
    body:new URLSearchParams({secret,response:challenge ?? '',remoteip:c.req.header('CF-Connecting-IP') ?? ''}),
    signal:AbortSignal.timeout(8000)
  }).catch(()=>null)
  if (!response?.ok) return fail(503,'Security check is temporarily unavailable')
  const result=await response.json<{success:boolean;hostname:string;action:string}>()
  if (!result.success || result.hostname!==new URL(c.env.APP_ORIGIN).hostname || result.action!==action) {
    return fail(403,'Complete the security challenge')
  }
}
