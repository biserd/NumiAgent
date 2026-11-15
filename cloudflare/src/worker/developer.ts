import { z } from 'zod'
import { developerKeyScope, developerKeyLifespanDays, developerReadPaths, developerRequestLimit } from '../shared/developerAccess'
import { all, body, digest, fail, limit, now, one, router, run, token, uid } from './core'
import type { WebContext } from './core'

const readRoutes = developerReadPaths.map(path=>new RegExp('^/api/v1'+path.replace('{id}',
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')+'$','i'))
const keyPattern = /^Bearer (na_live_[0-9a-f]{64})$/i
type Key = {id:string;label:string;scope:string;created:number;expires:number}

export const developerKeys = router()
developerKeys.get('/',async c=>c.json(await all<Key>(c.env,
  'SELECT id,label,scope,created,expires FROM developer_keys WHERE user_id=? AND expires>? ORDER BY created DESC,id',
  c.get('user').id,now())))
developerKeys.post('/',async c=>{
  const {label} = await body(c,z.object({label:z.string().trim().min(1).max(80)}))
  const user = c.get('user').id
  await limit(c.env,'developer_keys_created',user,25)
  const secret = 'na_live_'+token()
  const created = now()
  const key = await one<Key>(c.env,`INSERT INTO developer_keys(id,user_id,label,token_hash,scope,created,expires)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM developer_keys WHERE user_id=? AND expires>?) < 10
    RETURNING id,label,scope,created,expires`,
    uid(),user,label,await digest(secret),developerKeyScope,created,created+developerKeyLifespanDays*86400,user,created)
  if (!key) return fail(409,'Revoke an API key before creating another. You can have up to 10 active keys.')
  return c.json({...key,secret},201)
})
developerKeys.delete('/:id',async c=>{
  await run(c.env,'DELETE FROM developer_keys WHERE id=? AND user_id=?',c.req.param('id'),c.get('user').id)
  return c.body(null,204)
})

export async function authorizeDeveloper(c:WebContext, authorization:string, next:()=>Promise<void>) {
  const secret = keyPattern.exec(authorization)?.[1]
  const user = secret && await one<{id:string;email:string}>(c.env,`SELECT u.id,u.email FROM developer_keys k
    JOIN users u ON u.id=k.user_id WHERE k.token_hash=? AND k.expires>? AND k.scope=? AND u.deleting=0`,
    await digest(secret),now(),developerKeyScope)
  if (!user) return c.json({error:'Invalid or expired NumiAgent API key'},401,{
    'WWW-Authenticate':'Bearer realm="NumiAgent API", error="invalid_token"'
  })
  if (!['GET','HEAD'].includes(c.req.method) || !readRoutes.some(route=>route.test(c.req.path))) {
    return c.json({error:'This endpoint requires a signed-in browser session'},403,{
      'WWW-Authenticate':'Bearer realm="NumiAgent API", error="insufficient_scope"'
    })
  }
  await limit(c.env,'developer_api',user.id,developerRequestLimit,60)
  c.set('user',{...user,session:''})
  await next()
}
