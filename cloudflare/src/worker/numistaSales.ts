import { z } from 'zod'
import { https } from '../shared/domain.ts'
import { boundedBody } from './core.ts'

const pageSize = 25
const salePage = z.object({sales_count:z.number().int().nonnegative(),sales_records:z.array(z.unknown()).max(pageSize)})
const saleRow = z.object({
  issue_id:z.number().int().positive(), auction_house:z.object({name:z.string().trim().min(1)}),
  auction_title:z.string(), auction_date:z.iso.date(), lot_number:z.union([z.string().min(1),z.number().int()]),
  lot_url:https, grade:z.string().nullish(),
  price:z.object({amount:z.number().positive().finite(),currency:z.string().regex(/^[A-Z]{3}$/),premium_included:z.boolean().nullish()})
})

export async function numistaSales(key:string,typeID:number,issueID:number,page:number,fetcher=fetch) {
  const url = new URL('/v3/types/'+typeID+'/sales_records','https://api.numista.com')
  url.search = new URLSearchParams({issue_id:String(issueID),page:String(page),count:String(pageSize)}).toString()
  const source = {typeID,issueID,source:'https://en.numista.com/'+typeID}
  try {
    const response = await fetcher(url,{headers:{'Numista-API-Key':key},redirect:'manual',signal:AbortSignal.timeout(8000)})
    if (response.status === 429) return {...source,status:'rate_limited',message:'Numista’s lookup limit was reached. Try again later.'}
    if (!response.ok) throw new Error('Numista sales lookup failed')
    const data = salePage.parse(JSON.parse(new TextDecoder().decode(await boundedBody(response,1024*1024))))
    const today = new Date().toISOString().slice(0,10)
    const seen = new Set<string>()
    const results = data.sales_records.flatMap(raw=>{
      const row = saleRow.safeParse(raw).data
      if (!row || row.issue_id!==issueID || row.auction_date>today || seen.has(row.lot_url)) return []
      seen.add(row.lot_url)
      return [{url:row.lot_url,house:row.auction_house.name,auction:row.auction_title,date:row.auction_date,
        lot:String(row.lot_number),grade:row.grade?.toUpperCase(),amount:row.price.amount,currency:row.price.currency,
        basis:row.price.premium_included==null?'unspecified':row.price.premium_included?'with_premium':'hammer'}]
    })
    const nextPage = page*pageSize < data.sales_count ? page+1 : undefined
    if (data.sales_count===0 && !data.sales_records.length) return {...source,status:'no_matches',message:'Numista has no recorded sales for this exact issue.'}
    return {...source,status:'results',results,nextPage,message:results.length ? undefined : 'No comparable lots with a source link and realized price on this page.'}
  } catch {
    return {...source,status:'unavailable',message:'Numista could not return sales records. Try again later.'}
  }
}
