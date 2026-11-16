import { createPrivateKey, sign } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'

const app = '6835208218'
const groupId = '64d76aa8-8a39-42e5-badb-a0372c333da3'
const groupName = 'NumiAgent Internal'
const origin = 'https://api.appstoreconnect.apple.com'
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, IOS_BUILD_NUMBER } = process.env

function signedToken(key) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })
  const body = encode({ iss: ASC_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })
  const signingInput = header + '.' + body
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' })
  return signingInput + '.' + signature.toString('base64url')
}

async function request(key, path, { query, data } = {}) {
  const url = new URL(path, origin)
  if (query) url.search = new URLSearchParams(query)
  const options = {
    method: data ? 'POST' : 'GET',
    body: data ? JSON.stringify({ data }) : undefined,
    headers: { Authorization: 'Bearer ' + signedToken(key), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  }
  const response = await fetch(url, options)
  if (response.status === 204) return
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const codes = result.errors?.map(error => error.code).filter(Boolean).join(', ')
    const error = new Error(options.method + ' ' + path + ' returned HTTP ' + response.status + (codes ? ' (' + codes + ')' : ''))
    error.status = response.status
    throw error
  }
  return result.data
}

async function waitFor(check, seconds, description) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      if (!(error.status === 429 || error.status >= 500 || error.name === 'TimeoutError')) throw error
    }
    await wait(15000)
  }
  throw new Error('Timed out waiting for ' + description)
}

async function distribute() {
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY || !/^\d+\.\d+$/.test(IOS_BUILD_NUMBER ?? '')) {
    throw new Error('App Store Connect credentials and a build number are required')
  }
  const key = createPrivateKey(ASC_PRIVATE_KEY)
  const group = await request(key, '/v1/betaGroups/' + groupId, { query: {
    'fields[betaGroups]': 'name,isInternalGroup',
  } })
  if (!group?.attributes.isInternalGroup || group.attributes.name !== groupName) {
    throw new Error('The configured beta group is not NumiAgent Internal')
  }
  console.log('Waiting for App Store Connect to process build ' + IOS_BUILD_NUMBER)
  const build = await waitFor(async () => {
    const builds = await request(key, '/v1/builds', { query: {
      'filter[app]': app,
      'filter[version]': IOS_BUILD_NUMBER,
      'fields[builds]': 'version,processingState,expired',
    } })
    const pending = builds.find(entry => entry.attributes.version === IOS_BUILD_NUMBER)
    if (!pending || pending.attributes.processingState === 'PROCESSING') return
    if (pending.attributes.expired || pending.attributes.processingState !== 'VALID') {
      throw new Error('Apple could not process this build: ' + pending.attributes.processingState)
    }
    return pending
  }, 720, 'Apple build processing')

  const route = '/v1/builds/' + build.id
  const hasGroup = async () => {
    const builds = await request(key, '/v1/betaGroups/' + groupId + '/relationships/builds', { query: { limit: '200' } })
    return builds.some(entry => entry.id === build.id)
  }
  if (!(await hasGroup())) {
    await request(key, route + '/relationships/betaGroups', { data: [{ type: 'betaGroups', id: groupId }] })
  }
  await waitFor(async () => {
    if (!(await hasGroup())) return false
    const details = await request(key, '/v1/buildBetaDetails', { query: {
      'filter[build]': build.id,
      'fields[buildBetaDetails]': 'internalBuildState',
    } })
    return details[0]?.attributes.internalBuildState === 'IN_BETA_TESTING'
  }, 180, 'internal TestFlight availability')
  console.log('Build ' + IOS_BUILD_NUMBER + ' is Testing in ' + groupName + '.')
}

try {
  await distribute()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
