import type { Env } from './core'
import { ebayEnabled } from './ebay'

export const domains = (env:Env) => (env.MARKET_DOMAINS ?? '').split(',').map(v=>v.trim().toLowerCase()).filter(v=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v))
export function capabilities(env:Env) {
  const allowed = domains(env)
  const activeFeed = !!env.MARKET_FEED_URL && allowed.length>0
  const ebay = ebayEnabled(env)
  const biddrDiscovery = !!env.FIRECRAWL_API_KEY && allowed.some(d=>d==='biddr.com' || d.endsWith('.biddr.com'))
  return {activeFeed,ebay,biddrDiscovery,emailAlerts:!!(env.EMAIL && env.EMAIL_FROM && (activeFeed || ebay || biddrDiscovery))}
}
