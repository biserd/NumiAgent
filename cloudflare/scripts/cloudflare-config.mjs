import { readFile, writeFile } from 'node:fs/promises'

const environment = process.argv[2]
if (!['staging','production'].includes(environment)) throw new Error('Choose staging or production')
const origin = new URL(process.env.NUMIS_APP_ORIGIN ?? '')
if (origin.protocol!=='https:' || origin.href!==origin.origin+'/' || origin.username || origin.password) {
  throw new Error('NUMIS_APP_ORIGIN must contain only the HTTPS origin')
}
const need = (key,pattern) => {
  const value = process.env[key] ?? ''
  if (!pattern.test(value)) throw new Error('Configure '+key)
  return value
}
const databaseId = need('NUMIS_D1_ID',/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
const oauthKvId = need('NUMIS_OAUTH_KV_ID',/^[0-9a-f]{32}$/i)
const from = need('NUMIS_EMAIL_FROM',/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
const siteKey = need('NUMIS_TURNSTILE_SITE_KEY',/^[a-z0-9_-]{12,}$/i)
const namespace = 'numisgraph-'+environment
const config = JSON.parse(await readFile('wrangler.jsonc','utf8'))
config.name = namespace
config.vars = {...config.vars,APP_MODE:environment,APP_ORIGIN:origin.origin,EMAIL_FROM:from,TURNSTILE_SITE_KEY:siteKey,
  VISION_MODEL:process.env.NUMIS_VISION_MODEL || config.vars.VISION_MODEL,
  MARKET_DOMAINS:process.env.NUMIS_MARKET_DOMAINS ?? '',MARKET_FEED_URL:process.env.NUMIS_MARKET_FEED_URL ?? '',
  EBAY_MARKET_ENABLED:process.env.NUMIS_EBAY_MARKET_ENABLED==='true'?'true':'false',
  SALE_FEED_URL:process.env.NUMIS_SALE_FEED_URL ?? '',SALE_SOURCE_DOMAINS:process.env.NUMIS_SALE_SOURCE_DOMAINS ?? '',
  AI_PER_USER:process.env.NUMIS_AI_PER_USER || config.vars.AI_PER_USER,AI_GLOBAL:process.env.NUMIS_AI_GLOBAL || config.vars.AI_GLOBAL,
  MARKET_PER_USER:process.env.NUMIS_MARKET_PER_USER || '30',MARKET_GLOBAL:process.env.NUMIS_MARKET_GLOBAL || '300'}
config.d1_databases = [{binding:'DB',database_name:namespace,database_id:databaseId}]
config.kv_namespaces = [{binding:'OAUTH_KV',id:oauthKvId}]
config.r2_buckets = [{binding:'PHOTOS',bucket_name:namespace}]
config.queues = JSON.parse(JSON.stringify(config.queues).replaceAll('-local','-'+environment))
config.workflows[0].name = 'numis-photo-'+environment
config.ai = {binding:'AI'}
config.send_email = [{name:'EMAIL',allowed_sender_addresses:[from]}]
config.observability = {enabled:true,logs:{enabled:true,invocation_logs:false}}
config.workers_dev = origin.hostname.endsWith('.workers.dev')
config.preview_urls = false
if (environment==='staging') config.assets.run_worker_first.push('/robots.txt','/app')
if (!config.workers_dev) config.routes = [{pattern:origin.hostname,custom_domain:true}]
await writeFile('wrangler.deploy.json',JSON.stringify(config,null,2)+'\n')
console.log('Wrote isolated '+environment+' binding configuration')
