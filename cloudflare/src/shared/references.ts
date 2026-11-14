import { referenceTerms } from './nomisma.generated.ts'

export const referenceKinds = ['ruler','mint','denomination','metal'] as const
type Kind = typeof referenceKinds[number]
type Term = typeof referenceTerms[number]
export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{Mark}/gu,'')
  .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu,' ').trim()
const canon = new Map<string,Term[]>()
for (const term of referenceTerms) {
  const keys = new Set([term.label, ...term.aliases].map(normalize))
  for (const key of keys) {
    const index = term.kind + ':' + key
    canon.set(index, [...(canon.get(index) ?? []), term])
  }
}
const attribute = (term: Term) => ({...term, attribution:'Nomisma.org', license:'CC BY'})
export function matchReference(kind: Kind, query: string) {
  const candidates = canon.get(kind+':'+normalize(query)) ?? []
  return candidates.length===1 ? attribute(candidates[0]) : null
}
export function searchReferences(query: string, kind?: Kind) {
  const key = normalize(query)
  if (!key) return []
  return referenceTerms.filter(term=>(!kind || term.kind===kind) &&
    [term.label, ...term.aliases].some(alias=>normalize(alias).includes(key))).slice(0, 25).map(attribute)
}

const firstCentury = ['augustus','tiberius','gaius','claudius','nero','galba','otho','vitellius','vespasian','titus','domitian','nerva','trajan']
export const firstCenturyRulers = firstCentury.map(id=>{
  const term=referenceTerms.find(term=>term.id===id && term.kind==='ruler')
  if (!term) throw new Error('Missing Roman ruler in Nomisma reference data')
  return attribute(term)
})
