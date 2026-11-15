import { z } from 'zod'
import { boundedBody } from './core.ts'
import type { Env } from './core'
import type { Hit } from './market'

const tokenSchema=z.object({access_token:z.string().min(1).max(20000),expires_in:z.number().positive().max(86400)})
const money=z.object({value:z.string().regex(/^\d+(\.\d+)?$/).transform(Number),currency:z.string().regex(/^[A-Z]{3}$/)})
const listing=z.object({
  itemWebUrl:z.url(),title:z.string().min(1).max(180),itemEndDate:z.iso.datetime({offset:true}).optional(),
  buyingOptions:z.array(z.string()),currentBidPrice:money.optional()
})
const items=z.object({itemSummaries:z.array(z.unknown()).max(50).optional()})
let tokenCache:{clientId:string;expires:number;token:string}|undefined
let pendingToken:Promise<string>|undefined

export const ebayEnabled=(env:Env)=>env.EBAY_MARKET_ENABLED==='true' && !!env.EBAY_CLIENT_ID && !!env.EBAY_CLIENT_SECRET

async function requestToken(clientId:string,secret:string){
  const response=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(6000),
    headers:{Authorization:'Basic '+btoa(clientId+':'+secret),'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'})
  })
  if(!response.ok) throw new Error('eBay OAuth provider unavailable')
  const token=tokenSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(response,32*1024))))
  tokenCache={clientId,expires:Date.now()+Math.max(0,token.expires_in-60)*1000,token:token.access_token}
  return token.access_token
}
async function accessToken(clientId:string,secret:string) {
  if(tokenCache?.clientId===clientId && tokenCache.expires>Date.now()) return tokenCache.token
  pendingToken ??= requestToken(clientId,secret).finally(()=>{pendingToken=undefined})
  return pendingToken
}

export async function searchEbay(env:Env,query:string,retrievedAt:string) {
  const token=await accessToken(env.EBAY_CLIENT_ID!,env.EBAY_CLIENT_SECRET!)
  const target=new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
  target.search=new URLSearchParams({q:query,category_ids:'11116',filter:'buyingOptions:{AUCTION}',limit:'20'}).toString()
  const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(7500),headers:{
    Authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US',Accept:'application/json'
  }})
  if(response.status===401 && tokenCache?.token===token) tokenCache=undefined
  if(!response.ok) throw new Error('eBay Browse unavailable')
  const data=JSON.parse(new TextDecoder().decode(await boundedBody(response,256*1024)))
  return normalizeEbay(data,retrievedAt)
}

export function normalizeEbay(payload:unknown,retrievedAt:string):Hit[] {
  const data=items.parse(payload)
  return (data.itemSummaries ?? []).flatMap(raw=>{
    const row=listing.safeParse(raw).data
    if(!row?.buyingOptions.includes('AUCTION')) return []
    const url=new URL(row.itemWebUrl)
    if(url.protocol!=='https:' || url.username || url.password || url.port ||
      !['ebay.com','www.ebay.com'].includes(url.hostname) || !url.pathname.startsWith('/itm/')) return []
    const state=row.itemEndDate ? Date.parse(row.itemEndDate)>Date.parse(retrievedAt)?'active':'closed' : 'unknown'
    const bid=row.currentBidPrice
    return [{
      url:url.href,title:row.title,state,closesAt:row.itemEndDate,verifiedAt:retrievedAt,auctionHouse:'eBay',
      price:bid && Number.isFinite(bid.value) ? {kind:'current_bid',amount:bid.value,currency:bid.currency} : undefined
    }]
  })
}
