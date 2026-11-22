import { Hono } from 'hono'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export type Job = { id: string; attempt: number }
export interface Env {
  DB: D1Database
  REFERENCE_CATALOG?: D1Database
  PHOTOS: R2Bucket
  ASSETS: Fetcher
  OAUTH_KV: KVNamespace
  IDENTIFY: Queue<Job>
  PHOTO_WORKFLOW: Workflow<Job>
  AI?: Ai
  EMAIL?: SendEmail
  APP_MODE: string
  APP_ORIGIN: string
  APP_STORE_AVAILABLE?: string
  EMAIL_FROM?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET?: string
  FIRECRAWL_API_KEY?: string
  GOOGLE_VISION_API_KEY?: string
  EBAY_MARKET_ENABLED?: string
  EBAY_CLIENT_ID?: string
  EBAY_CLIENT_SECRET?: string
  MARKET_DOMAINS?: string
  MARKET_FEED_URL?: string
  MARKET_FEED_TOKEN?: string
  SALE_FEED_URL?: string
  SALE_FEED_TOKEN?: string
  SALE_SOURCE_DOMAINS?: string
  VISION_MODEL: string
  AI_PER_USER: string
  AI_GLOBAL: string
  MARKET_PER_USER?: string
  MARKET_GLOBAL?: string
  BUDGET_ALERT_EMAIL?: string
}
type Variables = { user: { id: string; email: string; session: string } }
export type WebContext = Context<{ Bindings: Env; Variables: Variables }>
export const router = () => new Hono<{ Bindings: Env; Variables: Variables }>()
export const now = () => Math.floor(Date.now() / 1000)
export const uid = () => crypto.randomUUID()
export const usageWindow = (seconds=86400) => Math.floor(now()/seconds)*seconds
export const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('')
export async function digest(value: string | ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value)),
    byte => byte.toString(16).padStart(2,'0')).join('')
}
export const fail = (status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 503, message: string): never => {
  throw new HTTPException(status, { message })
}
export async function one<T>(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql).bind(...args).first<T>()
}
export async function all<T>(env: Env, sql: string, ...args: unknown[]) {
  return (await env.DB.prepare(sql).bind(...args).all<T>()).results
}
export function run(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql).bind(...args).run()
}
export async function limit(env: Env, action: string, subject: string, max: number, seconds = 86400) {
  if (!Number.isInteger(max) || max < 1) fail(503, 'Usage limit is unavailable')
  const row = await one<{ count: number }>(env, `INSERT INTO limits(action,subject,window,count) VALUES(?,?,?,1)
    ON CONFLICT(action,subject,window) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
    action, subject, usageWindow(seconds), max)
  if (!row) fail(429, 'Usage limit reached. Try again later.')
}
export function isLocal(env: Env) {
  return ['local','test'].includes(env.APP_MODE) &&
    ['127.0.0.1','localhost'].includes(new URL(env.APP_ORIGIN).hostname)
}
export function sameOrigin(c: WebContext) {
  if (c.req.header('Origin') !== c.env.APP_ORIGIN) fail(403, 'Origin validation failed')
}
export async function boundedBody(request: Pick<Request,'body'>, cap: number) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    length += next.value.byteLength
    if (length > cap) {
      await reader.cancel()
      fail(413, 'Request is too large')
    }
    chunks.push(next.value)
  }
  const buffer = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}
export async function body<T extends z.ZodType>(c: WebContext, schema: T): Promise<z.output<T>> {
  const bytes = await boundedBody(c.req.raw, 384 * 1024)
  let candidate: unknown
  try { candidate = JSON.parse(new TextDecoder().decode(bytes)) } catch { fail(400,'Expected JSON') }
  const parsed = schema.safeParse(candidate)
  if (!parsed.success) return fail(400, parsed.error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).slice(0,3).join('; '))
  return parsed.data
}
