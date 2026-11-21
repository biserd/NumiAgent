import { z } from 'zod'
import { catalogId, catalogSearch } from '../shared/referenceCatalog'
import type { catalogEntry, catalogRelease } from '../shared/referenceCatalog'
import { fail } from './core'
import type { Env } from './core'

type Entry = z.infer<typeof catalogEntry>
type Release = z.infer<typeof catalogRelease>
const fields = 'e.id,e.kind,e.title,e.issuer,e.denomination,e.year,e.source,e.dataset,e.attribution,e.license'

function database(env:Env) {
  return env.REFERENCE_CATALOG ?? fail(503,'The reference catalog is unavailable')
}

export async function getCatalogRelease(env:Env):Promise<Release> {
  const row = await database(env).prepare('SELECT version,total,sources FROM catalog_release WHERE singleton=1')
    .first<{version:string; total:number; sources:string}>()
  if (!row) return fail(503,'The reference catalog is unavailable')
  return {...row,sources:JSON.parse(row.sources)}
}

export async function searchCatalog(env:Env, {q,kind,limit,page}:z.infer<typeof catalogSearch>) {
  const tokens = q.normalize('NFKC').match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
  if (!tokens.length || tokens.length>18) return fail(400,'Enter between 1 and 18 catalog search terms')
  // Quote every token so user punctuation cannot change the FTS expression.
  const match = tokens.map(token=>'"'+token+'"').join(' AND ')
  const where = kind ? ' AND e.kind=?' : ''
  const db = database(env)
  const [release, matches] = await db.batch<{version:string}|Entry>([
    db.prepare('SELECT version FROM catalog_release WHERE singleton=1'),
    db.prepare(`SELECT ${fields} FROM catalog_fts JOIN catalog_entries e ON e.row_id=catalog_fts.rowid
      WHERE catalog_fts MATCH ?${where} ORDER BY (e.id=? COLLATE NOCASE) DESC,
      bm25(catalog_fts,4,6,3,3,2,1),e.id LIMIT ? OFFSET ?`)
      .bind(match,...(kind ? [kind] : []),q,limit+1,page*limit)
  ])
  const metadata = release.results[0]
  if (!metadata || !('version' in metadata)) return fail(503,'The reference catalog is unavailable')
  return {version:metadata.version,entries:matches.results.slice(0,limit) as Entry[],
    nextPage:matches.results.length>limit && page<100 ? page+1 : null}
}

export async function getCatalogEntry(env:Env,id:string) {
  const entry = await database(env).prepare(`SELECT ${fields} FROM catalog_entries e WHERE e.id=?`).bind(id).first<Entry>()
  return entry ?? fail(404,'Catalog entry not found')
}

export const catalogQuery = catalogSearch.extend({
  limit:z.coerce.number().int().min(1).max(50).default(20),
  page:z.coerce.number().int().min(0).max(100).default(0)
})
export const catalogEntryId = z.object({id:catalogId})
