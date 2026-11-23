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
        id: row.id, label: [row.year ?? row.gregorian_year ?? [...new Set([row.min_year,row.max_year].filter(v=>v!=null))].join('–'),
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
