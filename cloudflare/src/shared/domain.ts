import { z } from 'zod'
import { contactTopics } from './contact.ts'
import { firstCenturyRulers, normalize } from './references.ts'
export { normalize } from './references.ts'

export const id = z.string().uuid()
export const contactInput = z.object({
  email:z.email().max(250),
  topic:z.enum(contactTopics),
  message:z.string().trim().min(10).max(3000),
  challenge:z.string().max(2048).optional()
})
export const text = z.string().trim().max(180)
export const bulkItemPatch = z.object({
  ids:z.array(id).min(1).max(50).refine(ids=>new Set(ids).size===ids.length,'Select distinct specimens'),
  changes:z.strictObject({
    issuer:text.optional(),ruler:text.optional(),denomination:text.optional(),year:text.optional(),
    reference:text.optional(),grade:text.optional(),tags:text.optional(),collection_id:id.nullable().optional()
  }).refine(changes=>Object.keys(changes).length>0,'Choose at least one field to change')
})
const short = text.default('')
const long = z.string().trim().max(4000).default('')
const date = z.iso.date()
const currency = z.string().regex(/^[A-Z]{3}$/)
export const https = z.url({ protocol: /^https$/ }).max(1500).refine(value => {
  const url = new URL(value)
  return !url.username && !url.password
})
export const crop = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1)
}).refine(c => c.x + c.width <= 1.001 && c.y + c.height <= 1.001)

export const item = z.object({
  type: z.enum(['coin', 'banknote']),
  title: text.min(1),
  issuer: short, ruler: short, denomination: short, year: short, reference: short, grade: short,
  notes: long, tags: short, collection_id: id.nullish(),
  details: z.object({
    metal: short, mint: short, serial: short, signatures: short, obverse: short, reverse: short,
    inscriptions: short, mintMark: short, series: short, variant: short, provenance: long,
    certification: short, referenceUrl:https.optional(), purchaseSource: short, purchaseDate: date.optional(),
    description: long, obverseLegend: short, reverseLegend: short,
    dateFrom: z.number().int().optional(), dateTo: z.number().int().optional(),
    weightG: z.number().nonnegative().optional(), diameterMm: z.number().nonnegative().optional(),
    dieAxis: z.number().int().optional(),
    purchasePrice: z.number().nonnegative().optional(), fees: z.number().nonnegative().optional(),
    currency: currency.optional()
  }).optional()
})
export const photoLink = z.object({
  photoId: id, side: z.enum(['obverse','reverse','overview']), crop: crop.nullish()
})
export const candidate = item.pick({
  type: true, title: true, issuer: true, ruler: true, denomination: true,
  year: true, reference: true, notes: true, details: true
}).extend({ confidence: z.number().min(0).max(1), crop: crop.optional() })

export const sale = z.object({
  url: https, date, currency,
  amount: z.number().positive().max(100_000_000),
  basis: z.enum(['hammer','with_premium']),
  premium: z.number().min(0).max(100).nullish(),
  house: text.min(1), lot: text.min(1), auction: text.min(1), grade: short,
  match: z.enum(['strong','possible']),
  fx: z.object({currency,rate:z.number().positive().max(1_000_000),date,source:https}).optional(),
  sourceChecked: z.literal(true)
})
export type Sale = Omit<z.infer<typeof sale>, 'sourceChecked'> & { id: string; verification: string }

// Keep numerical grades, plus/minus and problem designations distinct.
function comparableGrade(value:string) {
  const grade=value.trim().toLowerCase().replace(/very fine/g,'vf').replace(/(?:extra|extremely) fine|\bef\b/g,'xf')
    .replace(/about uncirculated/g,'au').replace(/mint state/g,'ms').replace(/\s+/g,' ')
    .replace(/\b(vf|xf|au|ms)[ -]+(?=\d)/g,'$1')
  return /^(?:unknown|ungraded|unspecified|n\/a|\?)$/.test(grade) ? '' : grade
}
export function valueSales(sales: Sale[], currency: string, grade: string, today = new Date()) {
  const cutoff = new Date(today)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24)
  const day = today.toISOString().slice(0, 10)
  const deduped = new Map<string, Sale>()
  const targetGrade = comparableGrade(grade)
  for (const entry of sales) {
    const convertible = entry.fx?.currency===currency && entry.fx.date <= entry.date &&
      Date.parse(entry.date)-Date.parse(entry.fx.date)<=7*86400000
    if ((entry.currency !== currency && !convertible) || entry.match !== 'strong' || entry.date > day ||
        entry.date < cutoff.toISOString().slice(0,10) ||
        (!targetGrade || comparableGrade(entry.grade) !== targetGrade) ||
        (entry.basis === 'hammer' && entry.premium == null)) continue
    const key = [entry.house, entry.auction, entry.lot].map(normalize).join('|')
    if (!deduped.has(key)) deduped.set(key, entry)
  }
  const used = [...deduped.values()]
  const normalized = used.map(s => {
    const amount = s.basis === 'with_premium' ? s.amount : s.amount * (1 + s.premium! / 100)
    const fx = s.currency===currency ? undefined : s.fx
    return {id:s.id,amount:amount*(fx?.rate ?? 1),currency,fx}
  })
  const amounts = normalized.map(s=>s.amount).sort((a,b) => a - b)
  const percentile = (p: number) => {
    const index = (amounts.length - 1) * p
    const lower = Math.floor(index)
    return Math.round(100 * (amounts[lower] + (amounts[Math.ceil(index)] - amounts[lower]) * (index - lower))) / 100
  }
  return {
    status: used.length >= 3 ? 'estimated' : 'insufficient_market_evidence',
    currency, basis: 'with_premium', asOf: day, evidence: sales, used: used.map(x => x.id), normalized,
    range: used.length >= 3 ? { low: percentile(.25), median: percentile(.5), high: percentile(.75) } : null
  }
}

export const slot = z.object({
  label: text.min(1), ruler: short, reference: short, issuer: short, denomination: short, year: short,
  type: z.enum(['coin','banknote']).optional(), metal: short, source: https.optional(), aliases: z.array(text).max(12).default([]),
  denominationAliases:z.array(text).max(12).optional(),series:text.optional(),
  dateFrom:z.number().int().min(-9999).max(9999).optional(),dateTo:z.number().int().min(-9999).max(9999).optional()
}).refine(s => s.ruler || s.reference || s.issuer || s.denomination || s.year || s.type || s.metal ||
  s.series || s.dateFrom!==undefined || s.dateTo!==undefined, 'Add a matching field')
  .refine(s=>s.dateFrom===undefined || s.dateTo===undefined || s.dateFrom<=s.dateTo,'Start year must precede end year')
export type Slot = z.infer<typeof slot>
export type Item = z.infer<typeof item>
export function matchesSlot(s: Slot, specimen: Item) {
  const equal = (a: string, b: string) => normalize(a) === normalize(b)
  const explicitYear=/^-?\d{1,4}$/.test(specimen.year) ? Number(specimen.year) : undefined
  const start=specimen.details?.dateFrom ?? explicitYear ?? specimen.details?.dateTo
  const end=specimen.details?.dateTo ?? explicitYear ?? specimen.details?.dateFrom
  return (!s.type || specimen.type === s.type) &&
    (!s.reference || equal(s.reference, specimen.reference)) &&
    (!s.issuer || equal(s.issuer, specimen.issuer)) &&
    (!s.denomination || [s.denomination,...s.denominationAliases ?? []].some(value=>equal(value,specimen.denomination))) &&
    (!s.year || equal(s.year, specimen.year)) &&
    (!s.series || equal(s.series,specimen.details?.series ?? '')) &&
    (s.dateFrom===undefined || (start!==undefined && start>=s.dateFrom)) &&
    (s.dateTo===undefined || (end!==undefined && end<=s.dateTo)) &&
    (!s.metal || equal(s.metal, specimen.details?.metal ?? '')) &&
    (!s.ruler || [s.ruler, ...s.aliases].some(name => equal(name, specimen.ruler)))
}

export const romanTheme = firstCenturyRulers.map(({label,aliases,source}) => slot.parse({
  label, ruler: label, aliases, type: 'coin', source
}))

export function csv(rows: unknown[][]) {
  return rows.map(row => row.map(cell => {
    const value = String(cell ?? '')
    const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value
    return '"' + safe.replaceAll('"','""') + '"'
  }).join(',')).join('\r\n')
}
