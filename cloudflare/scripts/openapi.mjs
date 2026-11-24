import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { bulkItemPatch, contactInput, id, item, photoLink, sale, slot } from '../src/shared/domain.ts'
import { legacyBatch } from '../src/shared/legacy.ts'
import { developerReadPaths } from '../src/shared/developerAccess.ts'
import { catalogEntry, catalogId, catalogRelease, catalogResults, catalogSearch } from '../src/shared/referenceCatalog.ts'

const json = schema => ({'application/json':{schema}})
const type = value => ({type:value})
const object = (properties, required=Object.keys(properties)) => ({type:'object',properties,required})
const array = items => ({type:'array',items})
const ref = name => ({$ref:'#/components/schemas/'+name})
const string = type('string')
const yes = type('boolean')
const number = type('number')
const uuid = {type:'string',format:'uuid'}
const schema = validator => z.toJSONSchema(validator,{target:'openapi-3.0',io:'output'})
const definitions = {
  CatalogEntry:schema(catalogEntry), CatalogRelease:schema(catalogRelease), CatalogSearchResults:schema(catalogResults),
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
const endpoint = (method,path,summary,{input,output=type('object'),status=200,publicRoute=false,queries=[],pathSchema=uuid,media='application/json',responseMedia='application/json'}={})=>{
  const keys=[...path.matchAll(/\{([^}]+)\}/g)].map(match=>match[1])
  const security=publicRoute ? []:[{session:[]}]
  if (method==='get' && developerReadPaths.includes(path)) security.push({developerKey:[]})
  const operation={summary,security,
    parameters:[...keys.map(name=>({name,in:'path',required:true,schema:pathSchema})),...queries.map(query=>typeof query==='string' ?
      {name:query,in:'query',schema:query==='page'?{type:'integer',minimum:0}:string} : {in:'query',...query})],
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
endpoint('post','/contact','Submit a private support message',{publicRoute:true,status:201,
  input:z.toJSONSchema(contactInput,{target:'openapi-3.0',io:'input'}),output:object({reference:uuid})})
endpoint('get','/me','Get the collector account')
endpoint('post','/card-frame','Generate decorative card artwork from a style and sampled colors',{
  input:{...object({style:{enum:['Antiquity','Mint cabinet','Engraving']},
    colors:{type:'array',minItems:1,maxItems:2,items:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}}}),additionalProperties:false},
  responseMedia:'image/jpeg',output:{type:'string',format:'binary'}})
paths['/card-frame'].post.responses['503']={description:'Custom frame unavailable. The bundled designs are still available.'}
endpoint('get','/me/usage','Read daily account usage and quotas')
endpoint('delete','/me','Schedule account deletion',{status:202,input:object({confirm:{const:'DELETE'}})})
endpoint('get','/me/sessions','List active sessions',{output:array(type('object'))})
endpoint('delete','/me/sessions/{id}','Revoke a session',empty)
endpoint('post','/me/signout','Sign out of the current session',empty)
endpoint('get','/me/grants','List connected agents',{output:array(type('object'))})
endpoint('delete','/me/grants/{id}','Revoke an agent grant',empty)
const developerKey=object({id:uuid,label:string,scope:{const:'collection:read'},created:number,expires:number})
endpoint('get','/me/developer-keys','List active API keys without their secrets',{output:array(developerKey)})
endpoint('post','/me/developer-keys','Create a read-only API key and return its secret once',{
  input:object({label:{type:'string',minLength:1,maxLength:80}}),status:201,
  output:object({...developerKey.properties,secret:string})})
endpoint('delete','/me/developer-keys/{id}','Revoke an API key',empty)
endpoint('get','/me/export','Export account metadata')
endpoint('get','/collections','List collection folders',{output:array(type('object'))})
endpoint('post','/collections','Create a folder',{...idOut,input:name})
endpoint('put','/collections/{id}','Rename a folder',{...empty,input:name})
endpoint('delete','/collections/{id}','Delete the folder and unfile its specimens',empty)
endpoint('get','/items','Search and page physical specimens',{queries:['q','page','type','collection','sort'],
  output:object({items:array(ref('Item')),next:{type:['integer','null']}})})
endpoint('post','/items','Catalog a physical specimen',{...idOut,...fields})
endpoint('post','/items/bulk','Create or replace up to 50 specimen records',{input:array({allOf:[ref('Item'),object({id:uuid},[])]}),status:201,output:object({ids:array(uuid)})})
endpoint('patch','/items/bulk','Update selected fields on up to 50 owned specimens atomically',{
  input:z.toJSONSchema(bulkItemPatch,{target:'openapi-3.0',io:'input'}),output:object({updated:number})})
endpoint('post','/items/import/numisgraph','Import up to 25 owned legacy coin records using their original IDs',{
  input:z.toJSONSchema(legacyBatch,{target:'openapi-3.0',io:'input'}),status:201,
  output:object({imported:number,skipped:number,legacyPhotoLinks:number})})
endpoint('get','/items/statistics','Count owned specimens and photos')
endpoint('get','/items/export.csv','Export specimen CSV',{output:string,responseMedia:'text/csv'})
endpoint('get','/items/insurance.csv','Export an insurance inventory with comparable sales and private photo links',{output:string,responseMedia:'text/csv'})
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
endpoint('get','/valuations/{id}/research','Look up exact-reference sales from a configured approved provider')
endpoint('get','/valuations/{id}/guide','Look up Numista guide estimates. auto=1 matches the saved specimen.',{queries:['type','issue','currency','auto']})
endpoint('post','/valuations/{id}/guide','Choose a Numista type, resolve its issue from this specimen when possible, and remember the match',{input:object({type:number,issue:number,currency:string},['type'])})
endpoint('get','/market/capabilities','Read configured auction sources and email availability')
endpoint('post','/valuations/{id}/sales','Record collector-attested realized sale facts',{status:201,input:array(ref('Sale')),output:ref('Valuation')})
endpoint('get','/valuations/{id}/history','Read valuation snapshots',{output:array(type('object'))})
endpoint('get','/market/search','Search configured marketplace providers',{queries:['q'],output:ref('Market')})
endpoint('get','/references','Look up bundled Nomisma terms by English name or alias',{queries:['q','kind'],
  output:array(object({id:string,kind:string,label:string,sourceLabel:string,aliases:array(string),source:string,attribution:string,license:string}))})
endpoint('get','/references/ocre','Resolve an OCRE type identifier or official record URL',{queries:['id']})
endpoint('get','/catalog','Read public catalog release metadata and data downloads',{publicRoute:true,output:ref('CatalogRelease')})
endpoint('get','/catalog/search','Search public coin and banknote reference records',{
  queries:Object.entries(catalogSearch.shape).map(([name,validator])=>({name,...(name==='q'?{required:true}:{}),schema:schema(validator)})),
  output:ref('CatalogSearchResults')})
endpoint('get','/catalog/entries/{id}','Get a public reference record by its stable catalog ID',{
  pathSchema:schema(catalogId),output:ref('CatalogEntry')})
endpoint('get','/exchange-rates','Find a dated ECB reference conversion for a currency pair',{queries:['from','to','date'],
  output:object({currency:string,rate:number,date:string,source:string,provider:string,basis:string})})
endpoint('get','/watchlists','List saved marketplace searches',{output:array(type('object'))})
endpoint('post','/watchlists','Upsert a watch with optional email opt-in',{status:201,input:object({query:string,alert:yes},['query'])})
endpoint('delete','/watchlists/{id}','Remove a saved search or pause an automatic gap watch',empty)
endpoint('put','/watchlists/themes/{id}/email','Set the email preference for current and future watches on a checklist',{...empty,input:object({enabled:yes})})
endpoint('post','/watchlists/gap','Watch a missing checklist slot or update its email preference',{status:201,input:object({themeId:string,slotKey:string,alert:yes},['themeId','slotKey'])})

const spec={openapi:'3.1.0',info:{title:'NumiAgent REST API',version:'1.0.0',
  description:'Create a read-only developer key at /app#developer. Use it with Bearer authentication on operations marked developerKey. Browser mutations require the configured same Origin. MCP uses OAuth and Streamable HTTP at /mcp.'},
  servers:[{url:'/api/v1'}],paths,components:{schemas:definitions,securitySchemes:{
    session:{type:'apiKey',in:'cookie',name:'__Host-numis_session'},
    developerKey:{type:'http',scheme:'bearer',description:'A revocable NumiAgent API key with collection:read scope.'}
  }}}
await writeFile('public/openapi.json',JSON.stringify(spec,null,2)+'\n')
