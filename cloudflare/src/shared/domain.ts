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
    certification: short, purchaseSource: short, purchaseDate: date.optional(),
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

export function valueSales(sales: Sale[], currency: string, grade: string, today = new Date()) {
  const cutoff = new Date(today)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24)
  const day = today.toISOString().slice(0, 10)
  const deduped = new Map<string, Sale>()
  for (const entry of sales) {
    const convertible = entry.fx?.currency===currency && entry.fx.date <= entry.date &&
      Date.parse(entry.date)-Date.parse(entry.fx.date)<=7*86400000
    if ((entry.currency !== currency && !convertible) || entry.match !== 'strong' || entry.date > day ||
        entry.date < cutoff.toISOString().slice(0,10) ||
        (grade && normalize(entry.grade) !== normalize(grade)) ||
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
  type: z.enum(['coin','banknote']).optional(), metal: short, source: https.optional(), aliases: z.array(text).max(12).default([])
}).refine(s => s.ruler || s.reference || s.issuer || s.denomination || s.year || s.type || s.metal, 'Add a matching field')
export type Slot = z.infer<typeof slot>
export type Item = z.infer<typeof item>
export function matchesSlot(s: Slot, specimen: Item) {
  const equal = (a: string, b: string) => normalize(a) === normalize(b)
  return (!s.type || specimen.type === s.type) &&
    (!s.reference || equal(s.reference, specimen.reference)) &&
    (!s.issuer || equal(s.issuer, specimen.issuer)) &&
    (!s.denomination || equal(s.denomination, specimen.denomination)) &&
    (!s.year || equal(s.year, specimen.year)) &&
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
