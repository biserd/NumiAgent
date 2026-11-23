import type { Hit } from './market'

export function canonicalLot(value:string) {
  const url = new URL(value)
  url.hash = ''
  const biddrLot = /(^|\.)biddr\.com$/.test(url.hostname) && /^\/auctions\/[^/]+\/browse\/?$/.test(url.pathname)
    && ['a','l'].every(key=>/^[1-9]\d*$/.test(url.searchParams.get(key) ?? ''))
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid)$/i.test(key) || (biddrLot && !['a','l'].includes(key))) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  return {url:url.href,biddrLot}
}

export function newAuctionAlerts(hits:Hit[],seen:string[],allowBiddrLeads:boolean) {
  const known = new Set(seen)
  const news = []
  for (const hit of hits) {
    const {url,biddrLot} = canonicalLot(hit.url)
    const active = hit.state==='active'
    if (!active && !(allowBiddrLeads && biddrLot && hit.state==='unknown')) continue
    const key = active ? url : 'lead:'+url
    if (known.has(key) || known.has(url)) continue
    known.add(key)
    news.push({hit,key,label:active?'Verified active lot':'biddr lead · check auction status'})
    if (news.length===20) break
  }
  return news
}
