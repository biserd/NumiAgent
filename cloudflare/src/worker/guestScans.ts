import { z } from 'zod'
import { boundedBody, digest, fail, isLocal, limit, now, one, router, run, sameOrigin } from './core'
import { identifyImageEvidence, photoImage } from './ingest'

const lifetime = 20 * 60
const lease = 120
const maxPhoto = 2 * 1024 * 1024
const frame = z.base64().max(Math.ceil(maxPhoto / 3) * 4)
const request = z.object({ front: frame, back: frame.optional() }).strict()
const jobID = /^(\d{10})-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
type Scan = { capability:string; input_digest:string; state:string; attempt:number; result:string|null }

function decodeJpeg(value:string): Uint8Array<ArrayBuffer> {
  const photo = Uint8Array.from(atob(value), character => character.charCodeAt(0))
  if (photo.length > maxPhoto) return fail(413,'Each photo must be 2 MB or smaller')
  if (photo.length < 4 || photo[0] !== 255 || photo[1] !== 216 ||
      photo[photo.length-2] !== 255 || photo[photo.length-1] !== 217) return fail(415,'Expected a JPEG photo')
  return photo
}

export const guestScans = router()
guestScans.post('/:id',async c=>{
  sameOrigin(c)
  const id = c.req.param('id')
  const stamp = Number(jobID.exec(id)?.[1])
  const received = now()
  if (!stamp || stamp > received + 60) return fail(400,'Invalid scan ID or device clock')
  const expires = stamp + lifetime
  if (received >= expires) return c.json({error:'This scan expired. Start a new online search.'},410)
  const authorization = c.req.header('Authorization')
  if (!authorization || !/^Bearer [0-9a-f]{64}$/.test(authorization)) return fail(401,'A scan key is required')
  const capability = await digest(authorization.slice(7))
  const ip = await digest(c.req.header('CF-Connecting-IP') ?? 'local')
  await limit(c.env,'guest_request_ip',ip,60,3600)
  const bytes = await boundedBody(c.req.raw,2*Math.ceil(maxPhoto/3)*4+256)
  let decoded: unknown
  try { decoded = JSON.parse(new TextDecoder().decode(bytes)) } catch { return fail(400,'Expected selected photos') }
  const input = request.safeParse(decoded)
  if (!input.success) return fail(400,'Select a front photo and an optional back photo')
  const images = [input.data.front,input.data.back].flatMap(value=>value ? [decodeJpeg(value)] : [])
  const fingerprint = await digest(JSON.stringify(input.data))
  const current = await one<Scan>(c.env,'SELECT capability,input_digest,state,attempt,result FROM guest_scans WHERE id=?',id)
  if (current && current.capability !== capability) return fail(404,'Scan not found')
  if (current && current.input_digest !== fingerprint) return fail(409,'The selected photos changed. Start a new search.')
  if (current?.state === 'complete') return c.json({state:'complete',candidates:JSON.parse(current.result ?? '[]')})
  const claim = await one<{attempt:number}>(c.env,`INSERT INTO guest_scans VALUES(?,?,?,?,'running',1,?,NULL)
    ON CONFLICT(id) DO UPDATE SET state='running',attempt=attempt+1,started=excluded.started
    WHERE capability=excluded.capability AND input_digest=excluded.input_digest
      AND (state='failed' OR (state='running' AND started<=?)) AND attempt<3 RETURNING attempt`,
    id,capability,fingerprint,expires,received,received-lease)
  if (!claim) {
    const existing = await one<Scan>(c.env,'SELECT capability,input_digest,state,attempt,result FROM guest_scans WHERE id=?',id)
    if (!existing || existing.capability !== capability) return fail(404,'Scan not found')
    if (existing.input_digest !== fingerprint) return fail(409,'The selected photos changed. Start a new search.')
    if (existing.state === 'complete') return c.json({state:'complete',candidates:JSON.parse(existing.result ?? '[]')})
    if (existing.attempt >= 3 && existing.state === 'failed') return fail(409,'This search could not finish. Start a new search.')
    return c.json({state:'running',candidates:[]},202)
  }
  try {
    await limit(c.env,'guest_scan_ip',ip,16,3600)
    await limit(c.env,'guest_scan_global','global',100)
    const candidates = c.env.APP_MODE === 'test' && isLocal(c.env) ? [
      {type:'coin',title:'Synthetic online fixture',confidence:.8}
    ] : await identifyImageEvidence(c.env,'guest:'+ip,images.map(bytes=>photoImage(bytes,'image/jpeg')))
    const saved = await run(c.env,`UPDATE guest_scans SET state='complete',result=? WHERE id=? AND attempt=? AND expires>?`,
      JSON.stringify(candidates),id,claim.attempt,now())
    if (!saved.meta.changes) return c.json({error:'This scan expired. Start a new online search.'},410)
    return c.json({state:'complete',candidates})
  } catch {
    await run(c.env,"UPDATE guest_scans SET state='failed' WHERE id=? AND attempt=?",id,claim.attempt)
    return fail(503,'Online identification could not finish. Your draft is still saved.')
  }
})
