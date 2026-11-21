import { z } from 'zod'

export const catalogId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._()\u02BB-]{0,159}$/)
export const catalogSearch = z.object({
  q:z.string().trim().min(1).max(180),
  kind:z.enum(['coin','banknote']).optional(),
  limit:z.number().int().min(1).max(50).default(20),
  page:z.number().int().min(0).max(100).default(0)
})
export const catalogEntry = z.object({
  id:catalogId, kind:z.enum(['coin','banknote']), title:z.string(), issuer:z.string(),
  denomination:z.string(), year:z.string(), source:z.string().url(), dataset:z.string(),
  attribution:z.string(), license:z.string()
})
export const catalogRelease = z.object({
  version:z.string(), total:z.number().int(), sources:z.record(z.string(),z.object({
    count:z.number().int(), attribution:z.string(), license:z.string(), download:z.string().url()
  }))
})
export const catalogResults = z.object({version:z.string(), entries:z.array(catalogEntry), nextPage:z.number().int().nullable()})
