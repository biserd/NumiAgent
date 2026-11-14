import { OAuthAuthorizationServer, OAuthResourceServer, AuthorizationError, insufficientScope } from '@cloudflare/workers-oauth-provider'
import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { html } from 'hono/html'
import { z } from 'zod'
import { id } from '../shared/domain'
import { currentUser } from './auth'
import { findItem, listItems, listThemes, stats, themeProgress, valuation } from './collection'
import { all, digest, limit, now, one, router, run, sameOrigin, uid } from './core'
import type { Env } from './core'
import { photoStatus } from './ingest'
import { marketSearch } from './market'

type Grant = { userId:string; consentId:string }
const scope = 'collection:read'
const endpoint = (env:Env) => env.APP_ORIGIN+'/mcp'
function authority(env:Env) {
  return new OAuthAuthorizationServer<Env>({
    issuer:env.APP_ORIGIN, resources:[endpoint(env)], scopesSupported:[scope],
    authorizeEndpoint:'/oauth/authorize', tokenEndpoint:'/oauth/token', clientRegistrationEndpoint:'/oauth/register',
    defaultResource:endpoint(env),
    accessTokenTTL:900
  })
}
const consent = router()
consent.on(['GET','POST'],'/oauth/authorize',async c=>{
  const current = await currentUser(c)
  const url = new URL(c.req.url)
  const oauth = authority(c.env).getOAuthApi(c.env)
  try {
    const request = await oauth.parseAuthRequest(new Request(url))
    if (!request.codeChallenge || request.codeChallengeMethod!=='S256') return c.text('S256 PKCE is required',400)
    if (request.scope.some(s=>s!==scope)) return c.text('Unsupported scope',400)
    if (Array.isArray(request.resource) ? request.resource.some(r=>r!==endpoint(c.env)) : request.resource && request.resource!==endpoint(c.env)) {
      return c.text('Unsupported OAuth resource',400)
    }
    if (!current) return c.redirect('/app?connect='+encodeURIComponent(url.pathname+url.search))
    if (c.req.method==='GET') {
      const client = await oauth.lookupClient(request.clientId)
      return c.html(html`<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width">
        <title>Connect an agent · NumiAgent</title><main>
        <h1>Connect an agent</h1><p>Allow <strong>${client?.clientName || request.clientId}</strong> to read collection records,
        saved identifications, valuations and themes for ${current.email}, and search configured marketplaces?</p>
        <p>Redirect destination <code>${request.redirectUri}</code></p>
        <form method="post"><button type="submit">Allow collection access</button> <a href="/app">Cancel</a></form>
        </main></html>`)
    }
    sameOrigin(c)
    await limit(c.env,'oauth_consent',current.id,25)
    const consentId = uid()
    await run(c.env,'INSERT INTO oauth_consents VALUES(?,?,?,?,?)',consentId,current.id,request.clientId,scope,now())
    try {
      const {redirectTo} = await oauth.completeAuthorization({
        request,userId:current.id,metadata:{consentId},scope:[scope],props:{userId:current.id,consentId} satisfies Grant
      })
      return c.redirect(redirectTo,303)
    } catch (error) {
      await run(c.env,'DELETE FROM oauth_consents WHERE id=?',consentId)
      throw error
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.redirectTo) return c.redirect(error.redirectTo)
      return c.text(error.description ?? 'Invalid authorization request',400)
    }
    throw error
  }
})
export const grants = router()
grants.get('/', async c=>c.json(await all(c.env,'SELECT id,client_id,scopes,created FROM oauth_consents WHERE user_id=? ORDER BY created DESC',c.get('user').id)))
grants.delete('/:id',async c=>{
  await run(c.env,'DELETE FROM oauth_consents WHERE id=? AND user_id=?',c.req.param('id'),c.get('user').id)
  return c.body(null,204)
})

const output = (data: unknown) => ({
  content:[{type:'text' as const,text:JSON.stringify(data)}],
  structuredContent:{data}
})
const safe = async (get:()=>Promise<unknown>)=>{
  try { return output(await get()) }
  catch (error) {
    const message = error instanceof Error && 'status' in error && Number(error.status)<500 ? error.message : 'Request failed'
    return {...output({error:message}),isError:true}
  }
}
function makeServer(env:Env,user:string) {
  const server = new McpServer({name:'NumiAgent',version:'0.1.0'})
  const options = (description:string) => ({description,annotations:{readOnlyHint:true}})
  const itemId = z.object({itemId:id})
  const themeId = z.object({themeId:id})
  const unit = z.object({})
  const query = z.string().trim().min(2).max(180)
  server.registerTool('search_my_collection',{...options('Search private specimens by text and optional type'),inputSchema:z.object({
    query:z.string().max(180).default(''),type:z.enum(['coin','banknote']).optional(),page:z.number().int().min(0).max(10000).default(0)
  })},args=>safe(()=>listItems(env,user,args.query,args.type,args.page)))
  server.registerTool('get_collection_item',{...options('Get a physical specimen and its photo IDs'),inputSchema:itemId},args=>safe(()=>findItem(env,user,args.itemId)))
  server.registerTool('get_collection_statistics',{...options('Count specimens and private photos'),inputSchema:unit},()=>safe(()=>stats(env,user)))
  server.registerTool('list_my_themes',{...options('List collecting goals'),inputSchema:unit},()=>safe(()=>listThemes(env,user)))
  server.registerTool('get_missing_items',{...options('Return owned and missing slots with reference links'),inputSchema:themeId},args=>safe(()=>themeProgress(env,user,args.themeId)))
  server.registerTool('identify_coin_or_banknote',{...options('Read candidate identifications for a previously submitted, consented photo'),inputSchema:z.object({photoId:id})},
    args=>safe(()=>photoStatus(env,user,args.photoId)))
  server.registerTool('get_valuation',{...options('Read the price range and its comparable-sale evidence'),inputSchema:itemId.extend({currency:z.string().regex(/^[A-Z]{3}$/).default('USD')})},
    args=>safe(()=>valuation(env,user,args.itemId,args.currency)))
  server.registerTool('get_recent_sales',{...options('Read source-linked auction evidence for a specimen'),inputSchema:itemId},
    args=>safe(async()=>(await valuation(env,user,args.itemId)).evidence))
  server.registerTool('search_market',{...options('Search configured providers. Query terms are sent externally.'),inputSchema:z.object({query})},
    args=>safe(()=>marketSearch(env,user,args.query)))
  server.registerTool('find_missing_items_for_sale',{...options('Search one missing theme slot across configured providers'),inputSchema:themeId.extend({label:z.string().max(180)})},
    args=>safe(async()=>{
      const theme = await themeProgress(env,user,args.themeId)
      const slot = theme.missing.find(s=>s.label===args.label)
      if (!slot) return {status:'missing_slot_unavailable'}
      return marketSearch(env,user,[slot.ruler || slot.label,slot.denomination,slot.reference,slot.metal].filter(Boolean).join(' ').slice(0,180))
    }))
  return server
}

export function agentRequest(request:Request,env:Env,ctx:ExecutionContext) {
  const url = new URL(request.url)
  if (url.pathname==='/oauth/authorize') return consent.fetch(request,env,ctx)
  const auth = authority(env)
  if (url.pathname==='/mcp' || url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    const resource = new OAuthResourceServer<Env,Grant>({
      resourceMetadata:{resource:endpoint(env),authorization_servers:[env.APP_ORIGIN]},
      requiredScopes:[scope],
      validateToken:bindings=>(resource,token)=>auth.validateToken(resource,token,bindings),
      handler:{
        async fetch(req,bindings,context) {
          if (!context.auth.scope.includes(scope)) return insufficientScope(context.auth,[scope])
          const {userId,consentId} = context.props
          if (!await one(bindings,`SELECT 1 FROM oauth_consents a JOIN users u ON u.id=a.user_id
             WHERE a.id=? AND u.id=? AND u.deleting=0`,consentId,userId)) return new Response('Grant revoked',{status:403})
          await limit(bindings,'mcp',userId,1000)
          return createMcpHandler(()=>makeServer(bindings,userId),{route:'/mcp'})(req,bindings,context)
        }
      }
    })
    return resource.fetch(request,env,ctx)
  }
  if (url.pathname==='/oauth/register' && request.method==='POST') {
    return digest(request.headers.get('CF-Connecting-IP') ?? 'local').then(async key=>{
      await limit(env,'oauth_register',key,30,3600)
      return auth.fetch(request,env,ctx)
    })
  }
  return auth.fetch(request,env,ctx)
}
