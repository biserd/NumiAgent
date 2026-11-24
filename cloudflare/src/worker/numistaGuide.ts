import { z } from 'zod'
import { boundedBody } from './core.ts'

const positiveID = z.number().int().positive().max(2147483647)
const issue = z.object({
  id: positiveID, year: z.union([z.number(), z.string()]).nullish(), gregorian_year: z.number().nullish(),
  mint_letter: z.string().nullish(), comment: z.string().nullish(), min_year:z.number().nullish(), max_year:z.number().nullish()
})
const quotes = z.object({ currency: z.string(), prices: z.array(z.object({
  grade: z.string().min(1).max(20), price: z.number().positive().finite()
})) })

export function numistaType(reference: string): number | undefined {
  const n = reference.match(/\bN\s*#\s*(\d+)\b/i)
  const url = reference.trim().match(/^https:\/\/(?:en\.|www\.)?numista\.com\/(?:catalogue\/(?:pieces|note))?(\d+)(?:\.html)?\/?(?:[?#].*)?$/i)
  const parsed = positiveID.safeParse(Number(n?.[1] ?? url?.[1]))
  return parsed.success ? parsed.data : undefined
}

const guideTypes=z.object({count:z.number().int().nonnegative(),types:z.array(z.object({
  id:positiveID,title:z.string(),issuer:z.object({name:z.string()}).nullish(),category:z.string().optional()
})).max(100)})
type CatalogHints={type:string;issuer:string;denomination:string;year:string}
export function canSearchType(item:CatalogHints) {
  return [item.issuer,item.denomination].every(v=>v.trim().length>0 && v.length<=80) && /^-?\d{1,4}$/.test(item.year.trim())
}
export async function discoverGuideType(key:string,item:CatalogHints,fetcher=fetch) {
  const url=new URL('https://api.numista.com/v3/types')
  url.search=new URLSearchParams({q:item.issuer+' '+item.denomination,year:item.year.trim(),
    category:item.type,count:'100',lang:'en'}).toString()
  const norm=(v:string)=>v.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
  try {
    const response=await fetcher(url,{headers:{'Numista-API-Key':key},redirect:'manual',signal:AbortSignal.timeout(8000)})
    if(!response.ok)return {status:response.status===429?'rate_limited':'unavailable'}
    const data=guideTypes.parse(JSON.parse(new TextDecoder().decode(await boundedBody(response,1024*1024))))
    const country=norm(item.issuer),denomination=norm(item.denomination)
    const candidates=data.types.filter(r=>norm(r.issuer?.name ?? '')===country && (!r.category || r.category===item.type))
    const precise=candidates.filter(r=>norm(r.title.split(/\s+[-–—]\s+|\s*\(/u)[0])===denomination)
    // Never infer uniqueness from a truncated page or from a single loose keyword hit.
    const match=data.count===data.types.length && candidates.length===1 && precise.length===1 ? precise[0].id : undefined
    return {status:'reference_required',typeID:match,candidates:candidates.slice(0,8).map(r=>({id:r.id,label:r.title}))}
  } catch { return {status:'unavailable'} }
}

export function matchingIssue(rows: z.infer<typeof issue>[], year: string, mintMark = '', variant = '') {
  const clean = (value: unknown) => String(value ?? '').trim().normalize('NFKC').toLowerCase()
  const date = year.trim()
  if (date && !/^-?\d{1,4}$/.test(date)) return
  const candidates = rows.filter(row => (!mintMark.trim() || clean(row.mint_letter) === clean(mintMark)) &&
    (!variant.trim() || clean(row.comment) === clean(variant)))
  if (date && candidates.some(row => row.year == null && row.gregorian_year == null &&
      (row.min_year == null || row.max_year == null))) return
  const matches = candidates.filter(row => !date || [row.year,row.gregorian_year].some(y=>y!=null && Number(y)===Number(date)) ||
    (row.min_year != null && row.max_year != null && Number(date)>=row.min_year && Number(date)<=row.max_year))
  return matches.length === 1 ? matches[0].id : undefined
}

export async function numistaGuide(key: string | undefined, typeID: number | undefined, issueID: number | undefined,
  currency: string, fetcher: typeof fetch = fetch) {
  const source = typeID ? 'https://en.numista.com/' + typeID : undefined
  const base = { typeID, source, currency }
  if (!key) return { ...base, status: 'provider_not_configured' }
  if (!typeID) return { ...base, status: 'reference_required' }
  const path = '/v3/types/' + typeID + '/issues' + (issueID ? '/' + issueID + '/prices' : '')
  const url = new URL(path, 'https://api.numista.com')
  url.searchParams.set('lang', 'en')
  if (issueID) url.searchParams.set('currency', currency)
  try {
    const res = await fetcher(url, { headers: { 'Numista-API-Key': key }, redirect: 'manual', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { ...base, status: res.status === 429 ? 'rate_limited' : res.status === 404 ? 'not_found' : 'unavailable' }
    const data: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(res,2*1024*1024)))
    if (!issueID) {
      const issues = z.array(issue).parse(data).map(row => ({
        ...row, label: [row.year ?? row.gregorian_year ?? [...new Set([row.min_year,row.max_year].filter(v=>v!=null))].join('–'),
          row.mint_letter, row.comment, 'Issue ' + row.id]
          .filter(value => value != null && value !== '').join(' · ')
      }))
      return { ...base, status: issues.length ? 'choose_issue' : 'no_issues', issues }
    }
    const result = quotes.parse(data)
    if (result.currency !== currency) return { ...base, status: 'unavailable' }
    return { ...base, issueID, status: result.prices.length ? 'prices' : 'no_prices', prices: result.prices }
  } catch { return { ...base, status: 'unavailable' } }
}
