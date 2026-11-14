import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { id, item, photoLink, sale, slot } from '../src/shared/domain.ts'
import { legacyBatch } from '../src/shared/legacy.ts'

const json = schema => ({'application/json':{schema}})
const type = value => ({type:value})
const object = (properties, required=Object.keys(properties)) => ({type:'object',properties,required})
const array = items => ({type:'array',items})
const ref = name => ({$ref:'#/components/schemas/'+name})
const string = type('string')
const yes = type('boolean')
const number = type('number')
const uuid = {type:'string',format:'uuid'}
const definitions = {
  Item:z.toJSONSchema(item.extend({photos:z.array(photoLink).optional()}),{target:'openapi-3.0',io:'input'}),
  Sale:z.toJSONSchema(sale,{target:'openapi-3.0',io:'input'}),
  Slot:z.toJSONSchema(slot,{target:'openapi-3.0',io:'input'}),
  Identifier:object({id:uuid}), Error:object({error:string}),
  Valuation:object({status:{enum:['estimated','insufficient_market_evidence']},currency:string,basis:string,asOf:string,
    evidence:array(type('object')),used:array(uuid),
    normalized:array(object({id:uuid,amount:number,currency:string,fx:type('object')},['id','amount','currency'])),
    range:{type:['object','null'],properties:{low:number,median:number,high:number}}}),
  Market:object({status:{enum:['unavailable','insufficient_verified_coverage','active_results']},retrievedAt:string,query:string,
    coverage:array(object({provider:string,domains:array(string),status:string})),
    results:array(object({url:{type:'string',format:'uri'},title:string,state:{enum:['active','closed','unknown']},closesAt:string,verifiedAt:string},['url','title','state']))})
}
const paths={}
const endpoint = (method,path,summary,{input,output=type('object'),status=200,publicRoute=false,queries=[],media='application/json',responseMedia='application/json'}={})=>{
  const keys=[...path.matchAll(/\{([^}]+)\}/g)].map(match=>match[1])
  const operation={summary,security:publicRoute ? []:[{session:[]}],
    parameters:[...keys.map(name=>({name,in:'path',required:true,schema:uuid})),...queries.map(name=>({name,in:'query',schema:name==='page'?{type:'integer',minimum:0}:string}))],
    responses:{[status]:{description:status===204?'Completed':'Success',...status!==204?{content:{[responseMedia]:{schema:output}}}:{}},
      '400':{description:'Invalid input',content:json(ref('Error'))},'401':{description:'Sign-in required'},'403':{description:'Authorization or origin check failed'},
      '404':{description:'Resource not found'},'429':{description:'Usage quota reached'}}
  }
  if (input) operation.requestBody={required:true,content:{[media]:{schema:input}}}
  if (!operation.parameters.length) delete operation.parameters
  ;(paths[path] ??= {})[method]=operation
}
const name=object({name:string})
const fields={input:ref('Item')}
const empty={status:204}
const idOut={status:201,output:ref('Identifier')}
endpoint('get','/health','Worker health',{publicRoute:true})
endpoint('get','/auth/config','Get Turnstile site key',{publicRoute:true})
endpoint('post','/auth/request','Request a sign-in link',{publicRoute:true,status:202,input:object({email:{type:'string',format:'email'},challenge:string},['email'])})
endpoint('post','/auth/verify','Consume the one-time link and issue a session cookie',{publicRoute:true,input:object({token:string})})
endpoint('get','/me','Get the collector account')
endpoint('get','/me/usage','Read daily account usage and quotas')
endpoint('delete','/me','Schedule account deletion',{status:202,input:object({confirm:{const:'DELETE'}})})
endpoint('get','/me/sessions','List active sessions',{output:array(type('object'))})
endpoint('delete','/me/sessions/{id}','Revoke a session',empty)
endpoint('post','/me/signout','Sign out of the current session',empty)
endpoint('get','/me/grants','List connected agents',{output:array(type('object'))})
endpoint('delete','/me/grants/{id}','Revoke an agent grant',empty)
endpoint('get','/me/export','Export account metadata')
endpoint('get','/collections','List collection folders',{output:array(type('object'))})
endpoint('post','/collections','Create a folder',{...idOut,input:name})
endpoint('put','/collections/{id}','Rename a folder',{...empty,input:name})
endpoint('delete','/collections/{id}','Delete the folder and unfile its specimens',empty)
endpoint('get','/items','Search and page physical specimens',{queries:['q','page','type','collection','sort'],
  output:object({items:array(ref('Item')),next:{type:['integer','null']}})})
endpoint('post','/items','Catalog a physical specimen',{...idOut,...fields})
endpoint('post','/items/bulk','Create or replace up to 50 specimen records',{input:array({allOf:[ref('Item'),object({id:uuid},[])]}),status:201,output:object({ids:array(uuid)})})
endpoint('post','/items/import/numisgraph','Import up to 25 owned legacy coin records using their original IDs',{
  input:z.toJSONSchema(legacyBatch,{target:'openapi-3.0',io:'input'}),status:201,
  output:object({imported:number,skipped:number,legacyPhotoLinks:number})})
endpoint('get','/items/statistics','Count owned specimens and photos')
endpoint('get','/items/export.csv','Export specimen CSV',{output:string,responseMedia:'text/csv'})
endpoint('get','/items/{id}','Get a specimen and its photo associations',{output:ref('Item')})
endpoint('put','/items/{id}','Replace specimen fields',{...empty,...fields})
endpoint('delete','/items/{id}','Delete a specimen',empty)
endpoint('get','/imports','List import batches',{output:array(type('object'))})
endpoint('post','/imports','Create or reopen a batch with a client UUID',{input:object({id:uuid,label:string,analyze:yes,consent:yes}),status:201})
endpoint('get','/imports/{id}','Read batch progress and candidates')
endpoint('put','/imports/{id}/photos','Upload a JPEG, PNG, or WebP as bytes (up to 6 MB)',{status:201,media:'application/octet-stream',input:{type:'string',format:'binary'}})
endpoint('post','/imports/{id}/cancel','Cancel pending jobs',empty)
endpoint('get','/photos/{id}','Stream an owned private photo',{responseMedia:'image/*',output:{type:'string',format:'binary'}})
endpoint('get','/photos/{id}/status','Read identification candidates')
endpoint('post','/photos/{id}/retry','Retry failed analysis',{status:202})
const checklist=object({name:string,slots:array(ref('Slot'))})
endpoint('get','/themes','List themes',{output:array(type('object'))})
endpoint('post','/themes','Save a theme',{...idOut,input:checklist})
endpoint('post','/themes/preview','Preview a supported checklist template',{input:object({goal:string})})
endpoint('get','/themes/{id}','Read checklist progress and missing slots')
endpoint('put','/themes/{id}','Replace checklist rules',{...empty,input:checklist})
endpoint('delete','/themes/{id}','Delete a theme',empty)
endpoint('get','/valuations/{id}','Read sale-backed valuation',{queries:['currency'],output:ref('Valuation')})
endpoint('post','/valuations/{id}/sales','Record collector-attested realized sale facts',{status:201,input:array(ref('Sale')),output:ref('Valuation')})
endpoint('get','/valuations/{id}/history','Read valuation snapshots',{output:array(type('object'))})
endpoint('get','/market/search','Search configured marketplace providers',{queries:['q'],output:ref('Market')})
endpoint('get','/references','Look up bundled Nomisma terms by English name or alias',{queries:['q','kind'],
  output:array(object({id:string,kind:string,label:string,sourceLabel:string,aliases:array(string),source:string,attribution:string,license:string}))})
endpoint('get','/watchlists','List saved marketplace searches',{output:array(type('object'))})
endpoint('post','/watchlists','Upsert a watch with optional email opt-in',{status:201,input:object({query:string,alert:yes},['query'])})
endpoint('delete','/watchlists/{id}','Remove a watch',empty)

const spec={openapi:'3.1.0',info:{title:'NumisVault REST API',version:'1.0.0',
  description:'Browser mutations require an Origin header equal to APP_ORIGIN. Remote MCP uses separate OAuth and Streamable HTTP at /mcp.'},
  servers:[{url:'/api/v1'}],paths,components:{schemas:definitions,securitySchemes:{session:{type:'apiKey',in:'cookie',name:'__Host-numis_session'}}}}
await writeFile('public/openapi.json',JSON.stringify(spec,null,2)+'\n')
