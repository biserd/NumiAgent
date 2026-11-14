import { z } from 'zod'
import { id, item, text } from './domain.ts'
import type { Item } from './domain.ts'

const optionalText = text.nullish()
const optionalNote = z.string().max(4000).nullish()
const decimal = z.union([z.number(), z.string().trim().regex(/^\d+(?:\.\d+)?$/).transform(Number)])
  .pipe(z.number().nonnegative().max(100_000_000)).nullish()
const year = z.number().int().min(-100_000).max(100_000).nullish()

export const legacyCoin = z.object({
  id: z.string().min(1).max(128),
  title: text.min(1),
  description: optionalNote,
  notes: optionalNote,
  ruler: optionalText,
  denomination: optionalText,
  mint: optionalText,
  metal: optionalText,
  reference: optionalText,
  dateFrom: year,
  dateTo: year,
  weightG: decimal,
  diameterMm: decimal,
  axis: z.number().int().nullish(),
  obvLegend: optionalText,
  revLegend: optionalText,
  obvImageId: z.string().max(128).nullish(),
  revImageId: z.string().max(128).nullish()
})
export const legacyBatch = z.object({
  collectionId: id.nullish(),
  coins: z.array(legacyCoin).min(1).max(25)
})

const yearLabel = (value: number) => value < 0 ? Math.abs(value) + ' BC' : value > 0 ? value + ' AD' : '0'

export function convertLegacyCoin(coin: z.output<typeof legacyCoin>, collectionId: string | null): Item {
  const dates = [...new Set([coin.dateFrom, coin.dateTo].filter((value): value is number => value != null))]
  return item.parse({
    type: 'coin',
    title: coin.title,
    notes: coin.notes ?? '',
    ruler: coin.ruler ?? '',
    denomination: coin.denomination ?? '',
    reference: coin.reference ?? '',
    year: dates.map(yearLabel).join(' – '),
    collection_id: collectionId,
    details: {
      description: coin.description ?? '',
      metal: coin.metal ?? '',
      mint: coin.mint ?? '',
      obverseLegend: coin.obvLegend ?? '',
      reverseLegend: coin.revLegend ?? '',
      dateFrom: coin.dateFrom ?? undefined,
      dateTo: coin.dateTo ?? undefined,
      weightG: coin.weightG ?? undefined,
      diameterMm: coin.diameterMm ?? undefined,
      dieAxis: coin.axis ?? undefined
    }
  })
}
