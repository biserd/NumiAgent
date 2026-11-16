import { candidate, crop } from '../shared/domain.ts'
import type { z } from 'zod'

export type Observation = z.infer<typeof candidate> & {
  visibleDate?: boolean
  catalogEvidence?: 'portrait' | 'design' | 'legends' | 'exact'
}

export function isRomanCoin(observation:Observation) {
  return observation.type==='coin' && /\b(?:roman (?:empire|imperial|silver|bronze|gold)|ancient rome)\b/i
    .test(observation.issuer+' '+observation.title)
}

export function automaticCatalogCandidate(observations: Observation[], bothSides = false) {
  if (observations.length !== 1) return undefined
  const [match] = observations
  if (isRomanCoin(match)) {
    const matchedLegends = match.catalogEvidence === 'legends' || match.catalogEvidence === 'exact'
    return bothSides && matchedLegends && match.confidence >= .9 && knownText(match.ruler) && knownText(match.denomination)
      ? match : undefined
  }
  if (match.confidence < .9 || !match.visibleDate || !/^[1-9]\d{0,3}(?:\s+(?:BC|BCE|AD|CE|AH))?$/i.test(match.year)) return undefined
  return knownText(match.denomination) && (knownText(match.issuer) || knownText(match.ruler)) ? match : undefined
}

type ObjectFields = Record<string, unknown>
const fields = (value: unknown): ObjectFields =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectFields : {}

function knownText(value: string) {
  return value.length > 0 && !/^(unknown|uncertain|unreadable|unidentified|unspecified|n\/?a|none|\?)$/i.test(value)
}

function optionalText(value: unknown, length: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return knownText(trimmed) ? trimmed.slice(0, length) : undefined
}

function confidence(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+(\.\d+)?%$/.test(trimmed)) value = Number(trimmed.slice(0, -1)) / 100
    else if (/^\d+(\.\d+)?$/.test(trimmed)) value = Number(trimmed)
  }
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : 0
}

const textFields = ['issuer', 'ruler', 'denomination', 'year', 'reference'] as const
const visualFields = [
  'metal', 'mint', 'serial', 'signatures', 'series', 'inscriptions', 'obverse', 'reverse',
  'obverseLegend', 'reverseLegend', 'mintMark', 'variant'
] as const

export function parseRomanLegends(raw:string) {
  const start=raw.indexOf('{')
  const end=raw.lastIndexOf('}')
  if (start<0 || end<start) return {}
  const input=fields(JSON.parse(raw.slice(start,end+1)))
  return Object.fromEntries(['obverseLegend','reverseLegend','obverse','reverse']
    .map(key=>[key,optionalText(input[key],180)]).filter(([,value])=>value!==undefined))
}

export function parsePhotoCandidates(raw: string) {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('Vision response did not contain an array')
  const entries: unknown = JSON.parse(raw.slice(start, end + 1))
  if (!Array.isArray(entries) || entries.length > 24) throw new Error('Vision response had an invalid candidate count')
  const valid = entries.flatMap(entry => {
    const input = fields(entry)
    const visual = fields(input.details)
    const details = Object.fromEntries(visualFields.map(key => [key, optionalText(visual[key] ?? input[key], 180)]))
    const type = optionalText(input.type, 32)?.toLowerCase()
    const result = candidate.safeParse({
      type,
      title: optionalText(input.title, 180) || undefined,
      ...Object.fromEntries(textFields.map(key => [key, optionalText(input[key], 180)])),
      notes: optionalText(input.notes, 4000),
      details,
      confidence: confidence(input.confidence),
      crop: crop.safeParse(input.crop).data
    })
    return result.success ? [{...result.data,visibleDate:entries.length === 1 && input.visibleDate === true}] : []
  })
  if (entries.length && !valid.length) throw new Error('Vision response contained no valid candidates')
  return valid
}
