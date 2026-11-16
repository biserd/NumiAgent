import { fail, now, one } from './core'
import type { Env } from './core'

export async function mergeItems(env:Env,user:string,target:string,source:string) {
  if (target===source) return fail(400,'Choose a different specimen')
  const eligible = `SELECT 1 FROM items keep JOIN items extra ON extra.user_id=keep.user_id AND extra.type=keep.type
    JOIN users u ON u.id=keep.user_id WHERE keep.id=? AND extra.id=? AND keep.user_id=? AND u.deleting=0`
  const identity = [target,source,user]
  if (!await one(env,eligible,...identity)) return fail(404,'Both specimens must belong to your collection and have the same type')

  const photoTotal = `SELECT COUNT(*) FROM item_photos l WHERE l.user_id=? AND (l.item_id=? OR
    (l.item_id=? AND NOT EXISTS(SELECT 1 FROM item_photos k WHERE k.user_id=l.user_id AND k.item_id=? AND k.photo_id=l.photo_id)))`
  const ready = `EXISTS(${eligible}) AND (${photoTotal})<=12`
  const guard = [...identity,user,target,source,target]
  const photoCount = '(SELECT COUNT(*) FROM item_photos WHERE user_id=? AND item_id=?)'
  const extraFields = ['issuer','ruler','denomination','year','reference','grade']
  const keepKnown = extraFields.map(field=>`${field}=COALESCE(NULLIF(items.${field},''),extra.${field})`).join(',')
  const [, , , , , removed] = await env.DB.batch([
    env.DB.prepare(`UPDATE items SET ${keepKnown},collection_id=COALESCE(items.collection_id,extra.collection_id),
      notes=CASE WHEN extra.notes='' OR extra.notes=items.notes THEN items.notes WHEN items.notes='' THEN extra.notes
        ELSE substr(items.notes||char(10)||extra.notes,1,4000) END,
      tags=CASE WHEN extra.tags='' OR extra.tags=items.tags THEN items.tags WHEN items.tags='' THEN extra.tags
        ELSE substr(items.tags||', '||extra.tags,1,180) END,
      details=json_patch(extra.details,COALESCE((SELECT json_group_object(key,value) FROM json_each(items.details)
        WHERE value IS NOT NULL AND value<>''),'{}')),updated=?
      FROM items extra WHERE extra.id=? AND items.id=? AND items.user_id=? AND ${ready}`)
      .bind(now(),source,target,user,...guard),
    env.DB.prepare(`UPDATE OR IGNORE item_photos SET side='obverse' WHERE user_id=? AND item_id=? AND side='overview'
      AND ${photoCount}=1 AND ${photoCount}=1 AND ${ready}`)
      .bind(user,target,user,target,user,source,...guard),
    env.DB.prepare(`INSERT OR IGNORE INTO item_photos(user_id,item_id,photo_id,side,crop)
      SELECT l.user_id,?,l.photo_id,CASE WHEN l.side='overview' AND ${photoCount}=1 AND ${photoCount}=1
        AND EXISTS(SELECT 1 FROM item_photos k WHERE k.user_id=l.user_id AND k.item_id=? AND k.side='obverse')
        THEN 'reverse' ELSE l.side END,l.crop
      FROM item_photos l WHERE l.user_id=? AND l.item_id=? AND ${ready}
        AND NOT EXISTS(SELECT 1 FROM item_photos k WHERE k.user_id=l.user_id AND k.item_id=? AND k.photo_id=l.photo_id)`)
      .bind(target,user,target,user,source,target,user,source,...guard,target),
    env.DB.prepare(`UPDATE OR IGNORE sales SET item_id=? WHERE user_id=? AND item_id=? AND ${ready}`)
      .bind(target,user,source,...guard),
    env.DB.prepare(`UPDATE valuation_history SET item_id=? WHERE user_id=? AND item_id=? AND ${ready}`)
      .bind(target,user,source,...guard),
    env.DB.prepare(`DELETE FROM items WHERE id=? AND user_id=? AND ${ready}`)
      .bind(source,user,...guard)
  ])
  if (!removed.meta.changes) return fail(409,'Could not combine these records. Check that they are still available and have at most 12 photos together.')
}
