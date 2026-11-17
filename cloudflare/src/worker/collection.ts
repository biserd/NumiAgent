import { z } from 'zod'
import { bulkItemPatch, csv, id, item, matchesSlot, photoLink, sale, slot, valueSales } from '../shared/domain'
import type { Item, Sale, Slot } from '../shared/domain'
import { convertLegacyCoin, legacyBatch } from '../shared/legacy'
import { all, body, fail, now, one, router, run, uid } from './core'
import type { Env } from './core'
import { previewTheme } from './themePlanning'
import { researchSales } from './saleResearch'
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

export async function saveIdentifiedPhoto(env:Env, photo:{id:string;user_id:string;attempt:number;batch_id:string;pair_side?:string|null}, input:Input,
  crop: z.infer<typeof photoLink>['crop'], candidates:string) {
  const {id:key,user_id:user,attempt} = photo
  const current = `SELECT 1 FROM photos p JOIN imports b ON b.id=p.batch_id AND b.user_id=p.user_id
    JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id=? AND p.attempt=? AND p.state='running'
    AND b.auto_catalog=1 AND b.cancelled=0 AND u.deleting=0
    AND (b.paired=0 OR COALESCE(b.expected_photos,2)=1+(
      SELECT COUNT(*) FROM photos companion WHERE companion.batch_id=p.batch_id AND companion.user_id=p.user_id
      AND companion.id<>p.id AND companion.state='manual'))`
  const guard = [key,user,attempt]
  const timestamp = now()
  const values = [key,user,...itemValues(input),timestamp,timestamp]
  const placeholders = values.map(()=>'?').join(',')
  // One stable item key per photo. The transaction commits the record, link and status together.
  const paired = photo.pair_side==='obverse'
  const statements = [
    env.DB.prepare(`INSERT INTO items(id,user_id,collection_id,type,title,issuer,ruler,denomination,year,reference,grade,notes,tags,details,created,updated)
      SELECT ${placeholders} WHERE EXISTS(${current}) ON CONFLICT(id) DO NOTHING`)
      .bind(...values,...guard),
    env.DB.prepare(`INSERT INTO item_photos(user_id,item_id,photo_id,side,crop)
      SELECT p.user_id,?,p.id,COALESCE(p.pair_side,'overview'),? FROM photos p
      WHERE p.user_id=? AND (p.id=? OR (?=1 AND p.batch_id=? AND p.state='manual'))
      AND EXISTS(${current}) AND EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=?)
      ON CONFLICT(item_id,photo_id,side) DO NOTHING`)
      .bind(key,!paired && crop ? JSON.stringify(crop) : null,user,key,Number(paired),photo.batch_id,...guard,key,user),
    env.DB.prepare(`UPDATE photos SET state='saved',candidates=?,error=NULL,updated=? WHERE id=? AND user_id=?
      AND EXISTS(${current}) AND EXISTS(SELECT 1 FROM item_photos WHERE user_id=? AND item_id=? AND photo_id=?)`)
      .bind(candidates,timestamp,key,user,...guard,user,key,key)
  ]
  if (paired) {
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
export const valuations = router()
valuations.get('/:id/research',async c=>{
  const user=c.get('user').id
  const specimen=await findItem(c.env,user,c.req.param('id'))
  return c.json(await researchSales(c.env,user,specimen))
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
  const specimens = (await all<Row>(env,'SELECT * FROM items WHERE user_id=?',user)).map(decode)
  const slots = (JSON.parse(theme.slots) as Slot[]).map(rule=>({...rule,owned:specimens.filter(i=>matchesSlot(rule,i))
    .map(i=>({id:i.id,title:i.title,hasReference:!!i.reference.trim()}))}))
  const owned = slots.filter(s=>s.owned.length > 0).length
  const missing=slots.filter(s=>!s.owned.length)
  const missingReferences=new Set(slots.flatMap(rule=>rule.owned.filter(item=>!item.hasReference).map(item=>item.id))).size
  const priorities=[...missing.filter(s=>s.source),...missing.filter(s=>!s.source)].slice(0,3)
    .map(s=>({label:s.label,reason:s.source?'Reference available to verify the target':'Next missing slot in checklist order'}))
  return {id:theme.id,name:theme.name,slots,owned,missing,priorities,missingReferences,percent:slots.length?Math.round(100*owned/slots.length):0}
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
themes.get('/:id',async c=>c.json(await themeProgress(c.env,c.get('user').id,c.req.param('id'))))
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
