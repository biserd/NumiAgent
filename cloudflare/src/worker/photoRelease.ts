import { createRemoteJWKSet, jwtVerify } from 'jose'
import { fail, limit } from './core'
import type { Env, WebContext } from './core'
import { identifyImageEvidence, photoImage } from './ingest'
import { matchOcreLegends } from './ocreIdentification'
import { automaticCatalogCandidate } from './vision'
import { normalize } from '../shared/references'

const issuer='https://token.actions.githubusercontent.com'
const keys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'),{timeoutDuration:4000})
const audience='https://numiagent.com/photo-identification-release'
const allowedWorkflow='biserd/NumiAgent/.github/workflows/ios-testflight.yml@refs/heads/main'
const allowedSubject='repo:biserd@4376132/NumiAgent@1121219233:environment:app-store'
const portraits=new Set(['faustina ii','faustina the younger','faustina younger','faustina junior','faustina minor'])

export async function verifyPhotoRelease(c:WebContext) {
  const token=c.req.header('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,7500})$/)?.[1]
  if (!token) return fail(401,'A release workflow token is required')
  let claims
  try {
    const {payload}=await jwtVerify(token,keys,{
      issuer,audience,algorithms:['RS256'],maxTokenAge:'8 minutes',
      subject:allowedSubject
    })
    claims=payload
  } catch { return fail(401,'Invalid release workflow token') }
  if (claims.repository_id!=='1121219233' || claims.workflow_ref!==allowedWorkflow ||
      claims.ref!=='refs/heads/main' || claims.event_name!=='workflow_dispatch') {
    return fail(403,'This workflow cannot run the photo release check')
  }
  await limit(c.env,'photo_release','github-actions',24)
  return c.json(await evaluateReleasePhotos(c.env))
}

export async function evaluateReleasePhotos(env:Env) {
  if (!env.AI) return fail(503,'Photo identification is unavailable')
  // The original failure used reverse first and included the full screenshot frame.
  const images=await Promise.all(['reverse','obverse'].map(async side=>{
    const object=await env.PHOTOS.get('release-verification/faustina-two-sided-v1/'+side+'.jpg')
    if (!object || object.size>512*1024) return fail(503,'The private release fixture is unavailable')
    return photoImage(new Uint8Array(await object.arrayBuffer()),'image/jpeg')
  }))
  const observations=await identifyImageEvidence(env,'release-verification',images)
  const [observation]=observations
  const result=observations.length===1 ? await matchOcreLegends(observation) : undefined
  const recognized=!!result && result.type==='coin' && portraits.has(normalize(result.ruler)) &&
    /^(?:silver |ar )?denarius$/i.test(result.denomination)
  const variantOpen=!!result && !result.reference && !result.details?.referenceUrl
  const record= result ? automaticCatalogCandidate([result],true) : undefined
  const safeSave=!record || !!record.ruler && !!record.denomination && !record.reference
  return {fixture:'faustina-two-sided-v1',passed:recognized && variantOpen && safeSave,recognized,variantOpen,safeSave,
    ruler:result?.ruler ?? '',denomination:result?.denomination ?? ''}
}
