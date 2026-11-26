import { z } from 'zod'
import { bulkItemPatch, csv, id, item, matchesSlot, normalize, photoLink, sale, slot, valueSales } from '../shared/domain'
import type { Item, Sale, Slot } from '../shared/domain'
import { convertLegacyCoin, legacyBatch } from '../shared/legacy'
import { all, body, digest, fail, limit, now, one, router, run, uid } from './core'
import { canSearchType, discoverGuideType, guideIssueChoices, numistaGuide, numistaType } from './numistaGuide'
import { numistaSales } from './numistaSales'
import type { Env } from './core'
import { previewTheme } from './themePlanning'
import { researchSales } from './saleResearch'
import { capabilities } from './marketCapabilities'
import { mergeItems } from './mergeItems'

const record = item.extend({ photos: z.array(photoLink).max(12).optional() })
type Input = z.infer<typeof record>
type Row = Omit<Item,'details'> & {id: string; created: number; updated: number; details:string; photo:string|null}
const select = `SELECT i.*, (SELECT photo_id FROM item_photos
 WHERE user_id=i.user_id AND item_id=i.id ORDER BY CASE side WHEN 'obverse' THEN 0 WHEN 'overview' THEN 1 ELSE 2 END LIMIT 1) AS photo FROM items i`
const decode = (row: Row) => ({...row,details:JSON.parse(row.details) as Item['details']})
export async function listItems(env: Env, user: string, query = '', type = '', page = 0, collection = '', sort = 'recent') {
  const term = '%' + query.replace(/[\\%_]/g,'\\$&') + '%'
  const order = sort === 'title' ? 'i.title COLLATE NOCASE,i.id' : 'i.created DESC,i.id DESC'
  const rows = await all<Row>(env,select + ` WHERE i.user_id=? AND (?='' OR i.type=?)
    AND (?='' OR i.collection_id=?) AND (i.title||' '||i.issuer||' '||i.ruler||' '||i.tags||' '||i.reference||' '||i.denomination||' '||i.year) LIKE ? ESCAPE '\\'
    ORDER BY ` + order + ' LIMIT 61 OFFSET ?',user,type,type,collection,collection,term,page*60)
  return {items:rows.slice(0,60).map(decode), next:rows.length>60 ? page+1:null}
}
export async function findItem(env: Env,user:string,key:string) {
  const row = await one<Row>(env,select + ' WHERE i.user_id=? AND i.id=?',user,key)
  if (!row) return fail(404,'Specimen unavailable')
  const photos = await all<{photoId:string;side:string;crop:string|null}>(env,
    'SELECT photo_id AS photoId,side,crop FROM item_photos WHERE user_id=? AND item_id=?',user,key)
  const duplicates = row.reference ? await all(env,'SELECT id,title FROM items WHERE user_id=? AND id<>? AND reference=? LIMIT 25', user,key,row.reference) : []
  return {...decode(row),photos:photos.map(p=>({...p,crop:p.crop ? JSON.parse(p.crop) : null})),duplicates}
}

const itemValues = (i:Input) => [i.collection_id ?? null,i.type,i.title,i.issuer,i.ruler,i.denomination,i.year,i.reference,
  i.grade,i.notes,i.tags,JSON.stringify(i.details ?? {})]

export async function saveIdentifiedPhoto(env:Env, photo:{id:string;user_id:string;attempt:number;batch_id:string;pair_side?:string|null;scan_slot?:number|null}, input:Input,
  crop: z.infer<typeof photoLink>['crop'], candidates:string,reviewed=false) {
  const {id:key,user_id:user,attempt} = photo
  if (input.collection_id) await requireCollection(env,user,input.collection_id)
  const current = `SELECT 1 FROM photos p JOIN imports b ON b.id=p.batch_id AND b.user_id=p.user_id
    JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id=? AND p.attempt=?
    AND u.deleting=0
    AND ((?=1 AND p.scan_slot%5=0 AND (p.state IN ('review','failed') OR (p.state='manual' AND p.error IS NOT NULL)))
      OR (?=0 AND p.state='running' AND b.auto_catalog=1 AND b.cancelled=0))
    AND (b.paired=0 OR COALESCE(b.expected_photos,2)=1+(
      SELECT COUNT(*) FROM photos companion WHERE companion.batch_id=p.batch_id AND companion.user_id=p.user_id
      AND companion.id<>p.id AND companion.state='manual'))`
  const guard = [key,user,attempt,Number(reviewed),Number(reviewed)]
  const timestamp = now()
  const values = [key,user,...itemValues(input),timestamp,timestamp]
  const placeholders = values.map(()=>'?').join(',')
  // One stable item key per photo. The transaction commits the record, link and status together.
  const paired = photo.pair_side==='obverse'
  const anchor=photo.scan_slot ?? null
  const statements = [
    env.DB.prepare(`INSERT INTO items(id,user_id,collection_id,type,title,issuer,ruler,denomination,year,reference,grade,notes,tags,details,created,updated)
      SELECT ${placeholders} WHERE EXISTS(${current}) ON CONFLICT(id) DO NOTHING`)
      .bind(...values,...guard),
    env.DB.prepare(`INSERT INTO item_photos(user_id,item_id,photo_id,side,crop)
      SELECT p.user_id,?,p.id,COALESCE(p.pair_side,CASE p.scan_slot%5 WHEN 0 THEN 'obverse' WHEN 1 THEN 'reverse' END,'overview'),? FROM photos p
      WHERE p.user_id=? AND (p.id=? OR (p.batch_id=? AND p.state='manual' AND (?=1 OR p.scan_slot BETWEEN ? AND ?)))
      AND EXISTS(${current}) AND EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=?)
      ON CONFLICT(item_id,photo_id,side) DO NOTHING`)
      .bind(key,!paired && anchor===null && crop ? JSON.stringify(crop) : null,user,key,photo.batch_id,Number(paired),anchor,anchor===null?null:anchor+4,...guard,key,user),
    env.DB.prepare(`UPDATE photos SET state='saved',candidates=?,error=NULL,updated=? WHERE id=? AND user_id=?
      AND EXISTS(${current}) AND EXISTS(SELECT 1 FROM item_photos WHERE user_id=? AND item_id=? AND photo_id=?)`)
      .bind(candidates,timestamp,key,user,...guard,user,key,key)
  ]
  if (paired || anchor!==null) {
    statements.push(env.DB.prepare(`UPDATE photos SET state='saved',updated=? WHERE user_id=? AND batch_id=? AND id<>?
      AND state='manual' AND EXISTS(SELECT 1 FROM item_photos WHERE user_id=? AND item_id=? AND photo_id=photos.id)
      AND EXISTS(SELECT 1 FROM photos front WHERE front.id=? AND front.user_id=? AND front.attempt=? AND front.state='saved')`)
      .bind(timestamp,user,photo.batch_id,key,user,key,key,user,attempt))
  }
  const [, , saved] = await env.DB.batch(statements)
  return saved.meta.changes > 0
}
function insertItem(env:Env, user:string, key:string, input:Input, legacyId:string|null=null) {
  return env.DB.prepare(`INSERT INTO items(id,user_id,collection_id,type,title,issuer,ruler,denomination,year,reference,grade,notes,tags,details,created,updated,legacy_coin_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,legacy_coin_id) DO NOTHING`)
    .bind(key,user,...itemValues(input),now(),now(),legacyId)
}
async function requireCollection(env:Env,user:string,key:string) {
  if (!await one(env,'SELECT 1 FROM collections WHERE id=? AND user_id=?',key,user)) fail(404,'Collection unavailable')
}

export async function saveItems(env: Env,user:string,entries:{id:string; input:Input; update?:boolean}[]) {
  const collections = new Set(entries.flatMap(e=>e.input.collection_id ? [e.input.collection_id] : []))
  for (const key of collections) {
    await requireCollection(env,user,key)
  }
  const photos = new Set(entries.flatMap(e=>e.input.photos?.map(p=>p.photoId) ?? []))
  for (const key of photos) {
    if (!await one(env,`SELECT 1 FROM photos WHERE id=? AND user_id=? AND state IN ('manual','review','saved','failed')`,key,user)) fail(404,'Photo unavailable for cataloging')
  }
  const statements = entries.flatMap(({id:key,input:i,update})=>{
    const first = update
      ? env.DB.prepare('UPDATE items SET collection_id=?,type=?,title=?,issuer=?,ruler=?,denomination=?,year=?,reference=?,grade=?,notes=?,tags=?,details=?,updated=? WHERE id=? AND user_id=?').bind(...itemValues(i),now(),key,user)
      : insertItem(env,user,key,i)
    if (!i.photos) return [first]
    return [first,env.DB.prepare('DELETE FROM item_photos WHERE item_id=? AND user_id=?').bind(key,user),
      ...i.photos.flatMap(p=>[
        env.DB.prepare('INSERT INTO item_photos VALUES(?,?,?,?,?)').bind(user,key,p.photoId,p.side,p.crop ? JSON.stringify(p.crop):null),
        env.DB.prepare(`UPDATE photos SET state='saved',updated=? WHERE user_id=? AND id=? AND state IN ('manual','review','failed','saved')`).bind(now(),user,p.photoId)
      ])]
  })
  await env.DB.batch(statements)
  return entries.map(e=>e.id)
}
export async function stats(env: Env,user: string) {
  const groups=await collectionEvidence(env,user)
  const portfolio = {currency:'USD',valuedItems:0,low:0,median:0,high:0}
  for (const group of groups.values()) {
    const result = valueSales(group.sales,portfolio.currency,group.grade)
    if (result.range) {
      portfolio.valuedItems++
      portfolio.low += result.range.low
      portfolio.median += result.range.median
      portfolio.high += result.range.high
    }
  }
  return {
    portfolio,
    counts: await all(env,'SELECT type,COUNT(*) AS count FROM items WHERE user_id=? GROUP BY type',user),
    photos: (await one<{count:number}>(env,'SELECT COUNT(*) AS count FROM photos WHERE user_id=? AND state<>?',user,'uploading'))?.count ?? 0,
    storageBytes: (await one<{bytes:number}>(env,'SELECT COALESCE(SUM(bytes),0) AS bytes FROM photos WHERE user_id=?',user))?.bytes ?? 0
  }
}
async function collectionEvidence(env:Env,user:string) {
  const evidence = await all<SaleRow & {item_id:string;specimen_grade:string}>(env,
    'SELECT s.*,i.grade AS specimen_grade FROM sales s JOIN items i ON i.id=s.item_id AND i.user_id=s.user_id WHERE s.user_id=? ORDER BY s.date DESC',user)
  const groups = new Map<string,{sales:Sale[];grade:string}>()
  for (const row of evidence) {
    const group = groups.get(row.item_id) ?? {sales:[],grade:row.specimen_grade}
    group.sales.push(saleFromRow(row))
    groups.set(row.item_id,group)
  }
  return groups
}

export const collections = router()
collections.get('/',async c=>c.json(await all(c.env,'SELECT id,name,created FROM collections WHERE user_id=? ORDER BY created',c.get('user').id)))
const name = z.object({name:z.string().trim().min(1).max(100)})
collections.post('/',async c=>{
  const input = await body(c,name)
  const key = uid()
  await run(c.env,'INSERT INTO collections VALUES(?,?,?,?)',key,c.get('user').id,input.name,now())
  return c.json({id:key,...input},201)
})
collections.put('/:id',async c=>{
  const input = await body(c,name)
  const result = await run(c.env,'UPDATE collections SET name=? WHERE id=? AND user_id=?',input.name,c.req.param('id'),c.get('user').id)
  if (!result.meta.changes) return fail(404,'Collection unavailable')
  return c.body(null,204)
})
collections.delete('/:id',async c=>{
  const args = [c.get('user').id,c.req.param('id')]
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE items SET collection_id=NULL WHERE user_id=? AND collection_id=?').bind(...args),
    c.env.DB.prepare('DELETE FROM collections WHERE user_id=? AND id=?').bind(...args)
  ])
  return c.body(null,204)
})

export const items = router()
items.get('/',async c=>{
  const page = Math.max(0,Math.min(10000,Number.parseInt(c.req.query('page') ?? '0',10) || 0))
  return c.json(await listItems(c.env,c.get('user').id,(c.req.query('q') ?? '').slice(0,180),c.req.query('type'),page,c.req.query('collection'),c.req.query('sort')))
})
items.get('/statistics',async c=>c.json(await stats(c.env,c.get('user').id)))
items.get('/export.csv',async c=>{
  const rows = await all<Record<string,unknown>>(c.env,`SELECT id,type,title,issuer,ruler,denomination,year,reference,grade,tags,notes,details,
    json_extract(details,'$.purchasePrice') AS purchase_price, json_extract(details,'$.fees') AS fees,
    json_extract(details,'$.currency') AS currency, json_extract(details,'$.purchaseDate') AS purchase_date,
    json_extract(details,'$.provenance') AS provenance,json_extract(details,'$.certification') AS certification
    FROM items WHERE user_id=? ORDER BY created`,c.get('user').id)
  const keys = ['id','type','title','issuer','ruler','denomination','year','reference','grade','tags','notes','purchase_price','fees','currency','purchase_date','provenance','certification','details']
  return c.text(csv([keys,...rows.map(r=>keys.map(key=>r[key]))]),200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="collection.csv"'})
})
items.get('/insurance.csv',async c=>{
  const user=c.get('user').id
  const [items,groups,photos]=await Promise.all([
    all<Row & {folder:string|null}>(c.env,`SELECT i.*,c.name AS folder FROM items i LEFT JOIN collections c
      ON c.id=i.collection_id AND c.user_id=i.user_id WHERE i.user_id=? ORDER BY i.title COLLATE NOCASE,i.id`,user),
    collectionEvidence(c.env,user),
    all<{item_id:string;photo_id:string}>(c.env,'SELECT item_id,photo_id FROM item_photos WHERE user_id=? ORDER BY item_id,side,photo_id',user)
  ])
  const photosByItem=new Map<string,string[]>()
  for(const photo of photos){
    const ids=photosByItem.get(photo.item_id) ?? []
    ids.push(c.env.APP_ORIGIN+'/api/v1/photos/'+photo.photo_id)
    photosByItem.set(photo.item_id,ids)
  }
  const snapshot=new Date()
  const headings=['specimen_id','collection','title','type','issuer','ruler','denomination','year','reference','grade',
    'certification','provenance','purchase_source','purchase_date','purchase_price','acquisition_fees','purchase_currency',
    'assessment_date','assessment_status','estimate_currency','estimate_low','estimate_median','estimate_high',
    'comparable_sale_urls','private_photo_urls','notes']
  const records=items.map(row=>{
    const specimen=decode(row)
    const detail=specimen.details
    const assessment=valueSales(groups.get(row.id)?.sales ?? [],'USD',row.grade,snapshot)
    const used=new Set(assessment.used)
    return [row.id,row.folder,row.title,row.type,row.issuer,row.ruler,row.denomination,row.year,row.reference,row.grade,
      detail?.certification,detail?.provenance,detail?.purchaseSource,detail?.purchaseDate,detail?.purchasePrice,detail?.fees,detail?.currency,
      assessment.asOf,assessment.status,assessment.currency,assessment.range?.low,assessment.range?.median,assessment.range?.high,
      assessment.evidence.filter(sale=>used.has(sale.id)).map(sale=>sale.url).join('\n'),(photosByItem.get(row.id) ?? []).join('\n'),row.notes]
  })
  return c.text(csv([headings,...records]),200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="numiagent-insurance-inventory.csv"'})
})
items.post('/',async c=>{
  const input = await body(c,record)
  const [key] = await saveItems(c.env,c.get('user').id,[{id:uid(),input}])
  return c.json({id:key},201)
})
items.post('/bulk',async c=>{
  const inputs = await body(c,z.array(record.extend({id:id.optional()})).min(1).max(50))
  const user = c.get('user').id
  const entries = inputs.map(({id:key,...input})=>({id:key ?? uid(),input,update:!!key}))
  for (const entry of entries) if (entry.update) await findItem(c.env,user,entry.id)
  return c.json({ids:await saveItems(c.env,user,entries)},201)
})
items.patch('/bulk',async c=>{
  const {ids,changes}=await body(c,bulkItemPatch)
  const user=c.get('user').id
  if(changes.collection_id) await requireCollection(c.env,user,changes.collection_id)
  const fields=Object.entries(changes)
  const assignments=fields.map(([field])=>field+'=?').join(',')
  const result=await run(c.env,`WITH selected AS (SELECT value AS id FROM json_each(?))
    UPDATE items SET ${assignments},updated=? WHERE user_id=? AND id IN (SELECT id FROM selected)
    AND ?=(SELECT COUNT(*) FROM items WHERE user_id=? AND id IN (SELECT id FROM selected))`,
    JSON.stringify(ids),...fields.map(([,value])=>value),now(),user,ids.length,user)
  if(result.meta.changes!==ids.length) return fail(404,'At least one selected specimen is unavailable')
  return c.json({updated:result.meta.changes})
})
items.post('/import/numisgraph',async c=>{
  const input = await body(c,legacyBatch)
  const user = c.get('user').id
  const collection = input.collectionId ?? null
  if (collection) await requireCollection(c.env,user,collection)
  const results = await c.env.DB.batch(input.coins.map(coin=>
    insertItem(c.env,user,uid(),convertLegacyCoin(coin,collection),coin.id)
  ))
  const imported = results.filter(result=>result.meta.changes>0).length
  const legacyPhotoLinks = input.coins.reduce((count,coin)=>count+Number(!!coin.obvImageId)+Number(!!coin.revImageId),0)
  return c.json({imported,skipped:input.coins.length-imported,legacyPhotoLinks},201)
})
items.get('/:id',async c=>c.json({
  ...await findItem(c.env,c.get('user').id,c.req.param('id')),
  googleVisionAvailable:!!c.env.GOOGLE_VISION_API_KEY?.trim()
}))
items.post('/:id/merge',async c=>{
  const key = id.parse(c.req.param('id'))
  const {sourceId} = await body(c,z.object({sourceId:id}))
  const user = c.get('user').id
  await mergeItems(c.env,user,key,sourceId)
  return c.json(await findItem(c.env,user,key))
})
items.post('/:id/photo-links',async c=>{
  const user=c.get('user').id
  const specimen=c.req.param('id')
  const {photoId,side}=await body(c,photoLink.pick({photoId:true,side:true}))
  await findItem(c.env,user,specimen)
  const photo=await one(c.env,"SELECT 1 FROM photos WHERE id=? AND user_id=? AND state IN ('manual','review','saved','failed')",photoId,user)
  if (!photo) return fail(404,'Photo unavailable')
  const [inserted]=await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO item_photos(user_id,item_id,photo_id,side,crop)
      SELECT ?,?,?,?,NULL WHERE EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=?)
      AND (SELECT COUNT(*) FROM item_photos WHERE user_id=? AND item_id=?)<12
      AND NOT EXISTS(SELECT 1 FROM item_photos l JOIN photos p ON p.id=l.photo_id
        WHERE l.user_id=? AND l.item_id=? AND p.sha=(SELECT sha FROM photos WHERE id=? AND user_id=?))
      `).bind(user,specimen,photoId,side,specimen,user,user,specimen,user,specimen,photoId,user),
    c.env.DB.prepare(`UPDATE photos SET state='saved',updated=? WHERE id=? AND user_id=?
      AND EXISTS(SELECT 1 FROM item_photos WHERE user_id=? AND item_id=? AND photo_id=?)`)
      .bind(now(),photoId,user,user,specimen,photoId)
  ])
  if (!inserted.meta.changes) {
    const linked=await one(c.env,`SELECT 1 FROM item_photos l JOIN photos p ON p.id=l.photo_id
      WHERE l.user_id=? AND l.item_id=? AND p.sha=(SELECT sha FROM photos WHERE id=? AND user_id=?)`,user,specimen,photoId,user)
    if (!linked) return fail(409,'This specimen has reached its photo limit')
  }
  return c.json({id:specimen},201)
})
items.put('/:id',async c=>{
  const input = await body(c,record)
  const key = c.req.param('id')
  const user = c.get('user').id
  await findItem(c.env,user,key)
  await saveItems(c.env,user,[{id:key,input,update:true}])
  return c.body(null,204)
})
items.delete('/:id',async c=>{
  await run(c.env,'DELETE FROM items WHERE user_id=? AND id=?',c.get('user').id,c.req.param('id'))
  return c.body(null,204)
})

type SaleRow = Omit<Sale,'fx'> & {fx:string|null}
const saleFromRow = (row:SaleRow):Sale => ({...row,fx:row.fx ? JSON.parse(row.fx):undefined})
export async function valuation(env:Env,user:string,key:string,currency='USD') {
  const specimen = await findItem(env,user,key)
  const sales = await all<SaleRow>(env,'SELECT * FROM sales WHERE item_id=? AND user_id=? ORDER BY date DESC',key,user)
  return valueSales(sales.map(saleFromRow),currency,specimen.grade)
}
const guideNumber = z.coerce.number().int().positive().max(2147483647)
const guideCurrency = z.string().regex(/^[A-Z]{3}$/).default('USD')
function guideIdentity(item: Awaited<ReturnType<typeof findItem>>) {
  return digest(JSON.stringify([item.type,item.title,item.issuer,item.ruler,item.denomination,item.year,item.reference,
    item.details?.mint,item.details?.mintMark,item.details?.variant,item.details?.referenceUrl]))
}
async function guideQuota(env:Env,user:string) {
  await limit(env,'numista_guide',user,40)
  await limit(env,'numista_guide','global',400)
}
async function guideReference(env:Env,user:string,specimen:Awaited<ReturnType<typeof findItem>>,automatic:boolean,type?:number,issue?:number) {
  const saved = automatic && !type && !issue ? await one<{type_id:number;issue_id:number}>(env,
    'SELECT type_id,issue_id FROM specimen_guide_links WHERE item_id=? AND identity=?',specimen.id,await guideIdentity(specimen)) : null
  const typeID = type ?? saved?.type_id ?? numistaType(specimen.reference) ?? numistaType(specimen.details?.referenceUrl ?? '')
  if (automatic && !typeID && env.NUMISTA_API_KEY && canSearchType(specimen)) {
    await guideQuota(env,user)
    const found = await discoverGuideType(env.NUMISTA_API_KEY,specimen)
    return {typeID:found.typeID,issueID:issue,discovery:found}
  }
  return {typeID,issueID:issue ?? saved?.issue_id}
}
async function specimenGuide(env: Env, user: string, specimen: Awaited<ReturnType<typeof findItem>>, typeID: number | undefined,
  issueID: number | undefined, currency: string, automatic: boolean) {
  const lookup = async (id?: number) => {
    if (env.NUMISTA_API_KEY && typeID) await guideQuota(env,user)
    return numistaGuide(env.NUMISTA_API_KEY,typeID,id,currency)
  }
  const result = await lookup(issueID)
  if (!automatic || !('issues' in result) || !result.issues.length) return result
  const {issues,match} = guideIssueChoices(result.issues,specimen.year,specimen.details?.mintMark,specimen.details?.variant)
  return match ? await lookup(match) : {...result,issues}
}
export const valuations = router()
valuations.get('/:id/guide',async c=>{
  const user = c.get('user').id
  const specimen = await findItem(c.env,user,c.req.param('id'))
  const params = z.object({type:guideNumber.optional(),issue:guideNumber.optional(),auto:z.literal('1').optional(),currency:guideCurrency}).safeParse(c.req.query())
  if (!params.success) return fail(400,'Use a numeric Numista ID and a three-letter currency')
  const {auto,currency,type,issue} = params.data
  const {typeID,issueID,discovery} = await guideReference(c.env,user,specimen,!!auto,type,issue)
  if (!typeID && discovery) return c.json({...discovery,currency})
  return c.json(await specimenGuide(c.env,user,specimen,typeID,issueID,currency,!!auto))
})
valuations.post('/:id/guide',async c=>{
  const user=c.get('user').id
  const item=await findItem(c.env,user,c.req.param('id'))
  const input=await body(c,z.object({type:guideNumber,issue:guideNumber.optional(),currency:guideCurrency}))
  const result=await specimenGuide(c.env,user,item,input.type,input.issue,input.currency,true)
  if('issueID' in result && (result.status==='prices' || result.status==='no_prices')) {
    await run(c.env,`INSERT INTO specimen_guide_links(item_id,identity,type_id,issue_id) VALUES(?,?,?,?)
      ON CONFLICT(item_id) DO UPDATE SET identity=excluded.identity,type_id=excluded.type_id,issue_id=excluded.issue_id`,
      item.id,await guideIdentity(item),input.type,result.issueID)
  }
  return c.json(result)
})
valuations.get('/:id/research',async c=>{
  const user=c.get('user').id
  const specimen=await findItem(c.env,user,c.req.param('id'))
  return c.json(await researchSales(c.env,user,specimen))
})
// First-party collector view only. Licensed records stay out of stored valuations, exports, developer keys and MCP.
valuations.get('/:id/numista-sales',async c=>{
  const user=c.get('user').id
  const specimen=await findItem(c.env,user,c.req.param('id'))
  const page=guideNumber.safeParse(c.req.query('page') ?? 1)
  if (!page.success) return fail(400,'Use a positive page number')
  const key=c.env.NUMISTA_API_KEY
  if (!key) return c.json({status:'provider_not_configured',message:'Numista sales lookup is unavailable.'})
  const {typeID,issueID:saved,discovery}=await guideReference(c.env,user,specimen,true)
  const unavailable={status:'unavailable',message:'Numista could not return sales records. Try again later.'}
  if (!typeID && discovery && discovery.status!=='reference_required') return c.json(unavailable)
  const issueRequired={status:'issue_required',message:'Choose the matching catalog type and issue in the Numista price guide to see its auction sales.'}
  if (!typeID) return c.json(issueRequired)
  let issueID=saved
  if (!issueID) {
    await guideQuota(c.env,user)
    const choices=await numistaGuide(key,typeID,undefined,'USD')
    if (choices.status==='choose_issue' && 'issues' in choices) {
      issueID=guideIssueChoices(choices.issues,specimen.year,specimen.details?.mintMark,specimen.details?.variant).match
    } else if (choices.status!=='no_issues' && choices.status!=='not_found') return c.json(unavailable)
  }
  if (!issueID) return c.json({...issueRequired,typeID,source:'https://en.numista.com/'+typeID})
  await limit(c.env,'numista_sales',user,20)
  await limit(c.env,'numista_sales','global',200)
  return c.json(await numistaSales(key,typeID,issueID,page.data))
})
valuations.get('/:id',async c=>{
  const currency = (c.req.query('currency') ?? 'USD').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return fail(400,'Use a three-letter currency code')
  return c.json(await valuation(c.env,c.get('user').id,c.req.param('id'),currency))
})
valuations.post('/:id/sales',async c=>{
  const evidence = await body(c,z.array(sale).min(1).max(30))
  const user = c.get('user').id
  const key = c.req.param('id')
  await findItem(c.env,user,key)
  if (evidence.some(s=>s.date>new Date().toISOString().slice(0,10))) return fail(400,'A realized sale date must be in the past')
  if (evidence.some(s=>s.fx && (s.fx.currency===s.currency || s.fx.date>s.date || Date.parse(s.date)-Date.parse(s.fx.date)>7*86400000))) {
    return fail(400,'Use a different conversion currency and a rate dated on the sale day or up to seven days earlier')
  }
  await c.env.DB.batch(evidence.map(s=>c.env.DB.prepare(`INSERT INTO sales(id,user_id,item_id,url,date,currency,amount,basis,premium,house,lot,grade,match,auction,fx)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_id,url) DO NOTHING`).bind(uid(),user,key,s.url,s.date,s.currency,s.amount,s.basis,s.premium ?? null,s.house,s.lot,s.grade,s.match,s.auction,s.fx ? JSON.stringify(s.fx):null)))
  const result = await valuation(c.env,user,key,evidence[0].fx?.currency ?? evidence[0].currency)
  await run(c.env,'INSERT INTO valuation_history VALUES(?,?,?,?,?)',uid(),user,key,JSON.stringify(result),now())
  return c.json(result,201)
})
valuations.get('/:id/history',async c=>c.json(await all(c.env,'SELECT created,snapshot FROM valuation_history WHERE user_id=? AND item_id=? ORDER BY created DESC LIMIT 50',c.get('user').id,c.req.param('id'))))

type Theme = {id:string;name:string;slots:string}
export const listThemes = (env:Env,user:string) => all<Omit<Theme,'slots'>>(env,'SELECT id,name FROM themes WHERE user_id=? ORDER BY created DESC',user)
export async function themeProgress(env:Env,user:string,key:string) {
  const theme = await one<Theme>(env,'SELECT id,name,slots FROM themes WHERE user_id=? AND id=?',user,key)
  if (!theme) return fail(404,'Theme unavailable')
  return progressFor(theme,await checklistItems(env,user))
}
const checklistItems = async(env:Env,user:string)=>(await all<Row>(env,'SELECT * FROM items WHERE user_id=?',user)).map(decode)
export async function watchedThemes(env:Env,user:string) {
  const themes=await all<Theme>(env,`SELECT id,name,slots FROM themes WHERE user_id=? AND id IN
    (SELECT theme_id FROM gap_watches WHERE user_id=?)`,user,user)
  const specimens=await checklistItems(env,user)
  return Promise.all(themes.map(theme=>progressFor(theme,specimens)))
}
async function progressFor(theme:Theme,specimens:Awaited<ReturnType<typeof checklistItems>>) {
  const slots = await Promise.all((JSON.parse(theme.slots) as Slot[]).map(async rule=>{
    const identity = [rule.type,rule.ruler,rule.issuer,rule.denomination,rule.reference,rule.metal,rule.year,rule.series]
      .map(value=>normalize(value ?? ''))
    const key = await digest(JSON.stringify([identity,rule.dateFrom,rule.dateTo,
      rule.aliases.map(normalize).sort(),(rule.denominationAliases ?? []).map(normalize).sort()]))
    const dates = [rule.dateFrom,rule.dateTo].filter(year=>year!=null)
      .map(year=>year < 0 ? Math.abs(year)+' BCE' : String(year))
    const terms = [rule.ruler,rule.issuer,rule.denomination,rule.reference,rule.metal,rule.year,rule.series,
      ...new Set(dates)].filter(Boolean)
    const keywords = [...new Set(terms.length ? terms : [rule.label,rule.type])].join(' ').trim()
    const query = (keywords.length>=2 ? keywords : keywords+' '+(rule.type ?? 'numismatics')).slice(0,180)
    return {...rule,slotKey:key,query,owned:specimens.filter(i=>matchesSlot(rule,i))
      .map(i=>({id:i.id,title:i.title,hasReference:!!i.reference.trim()}))}
  }))
  const owned = slots.filter(s=>s.owned.length > 0).length
  const missing=slots.filter(s=>!s.owned.length)
  const missingReferences=new Set(slots.flatMap(rule=>rule.owned.filter(item=>!item.hasReference).map(item=>item.id))).size
  const priorities=[...missing.filter(s=>s.source),...missing.filter(s=>!s.source)].slice(0,3)
    .map(s=>({label:s.label,reason:s.source?'Reference available to verify the target':'Next missing slot in checklist order'}))
  return {id:theme.id,name:theme.name,slots,owned,missing,priorities,missingReferences,percent:slots.length?Math.round(100*owned/slots.length):0}
}

// Backfill existing checklists and reconcile edits without requiring the app to be open.
export async function syncChecklistWatches(env:Env) {
  const dirty=await all<Theme & {user_id:string;revision:number}>(env,`SELECT t.*,s.revision FROM themes t
    JOIN checklist_auction_settings s ON s.theme_id=t.id JOIN users u ON u.id=t.user_id
    WHERE s.synced<>s.revision AND u.deleting=0 ORDER BY t.created,t.id LIMIT 12`)
  for (const theme of dirty) {
    const {slots}=await progressFor(theme,[])
    const rows=slots.map(slot=>({id:uid(),key:slot.slotKey,query:slot.query}))
    const version='SELECT 1 FROM checklist_auction_settings WHERE theme_id=? AND revision=?'
    await env.DB.batch([
      env.DB.prepare('UPDATE gap_watches SET in_rules=0 WHERE theme_id=? AND EXISTS ('+version+')')
        .bind(theme.id,theme.id,theme.revision),
      env.DB.prepare(`INSERT INTO gap_watches(id,user_id,theme_id,slot_key,query,alert)
        SELECT j.value->>'id',?,s.theme_id,j.value->>'key',j.value->>'query',s.email
        FROM json_each(?) j, checklist_auction_settings s WHERE s.theme_id=? AND s.revision=?
        ON CONFLICT(user_id,theme_id,slot_key) DO UPDATE SET in_rules=1,query=excluded.query`)
        .bind(theme.user_id,JSON.stringify(rows),theme.id,theme.revision),
      env.DB.prepare('UPDATE checklist_auction_settings SET synced=revision WHERE theme_id=? AND revision=?')
        .bind(theme.id,theme.revision)
    ])
  }
}
const themeInput = name.extend({slots:z.array(slot).min(1).max(100)})
export const themes = router()
themes.get('/',async c=>c.json(await listThemes(c.env,c.get('user').id)))
themes.post('/preview',async c=>{
  const { goal } = await body(c,z.object({goal:z.string().trim().min(1).max(400)}))
  return c.json(await previewTheme(c.env,c.get('user').id,goal))
})
themes.post('/',async c=>{
  const input = await body(c,themeInput)
  const key = uid()
  await run(c.env,'INSERT INTO themes VALUES(?,?,?,?,?)',key,c.get('user').id,input.name,JSON.stringify(input.slots),now())
  return c.json({id:key},201)
})
themes.get('/:id',async c=>{
  const user=c.get('user').id, id=c.req.param('id')
  const list=await themeProgress(c.env,user,id)
  const settings=await one<{email:number}>(c.env,'SELECT email FROM checklist_auction_settings WHERE theme_id=?',id)
  const watches=await all<{slot_key:string;paused:number;last_result:string|null}>(c.env,
    'SELECT slot_key,paused,last_result FROM gap_watches WHERE theme_id=? AND user_id=? AND in_rules=1',id,user)
  const auctionChecks=Object.fromEntries(watches.map(w=>{
    const result=w.last_result ? JSON.parse(w.last_result) as {
      checkedAt:string;status:string;lots:{title:string;url:string;label:string;closesAt?:string}[]
    } : undefined
    if (!result || w.paused) return [w.slot_key,{paused:!!w.paused}]
    const lots=result.lots.filter(lot=>!lot.closesAt || Date.parse(lot.closesAt)>Date.now())
    return [w.slot_key,{...result,lots,paused:false}]
  }))
  const sources=capabilities(c.env)
  return c.json({...list,emailNewLots:!!settings?.email,auctionEmailAvailable:sources.emailAlerts,
    auctionChecksAvailable:sources.activeFeed || sources.ebay || sources.biddrDiscovery,auctionChecks})
})
themes.put('/:id',async c=>{
  const input = await body(c,themeInput)
  const result = await run(c.env,'UPDATE themes SET name=?,slots=? WHERE user_id=? AND id=?',input.name,JSON.stringify(input.slots),c.get('user').id,c.req.param('id'))
  if (!result.meta.changes) return fail(404,'Theme unavailable')
  return c.body(null,204)
})
themes.delete('/:id',async c=>{
  await run(c.env,'DELETE FROM themes WHERE user_id=? AND id=?',c.get('user').id,c.req.param('id'))
  return c.body(null,204)
})
