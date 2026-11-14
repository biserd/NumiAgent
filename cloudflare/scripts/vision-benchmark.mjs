import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const [manifest, ...models] = process.argv.slice(2)
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_AI_TOKEN
if (!manifest || !models.length || !account || !token) {
  throw new Error('Pass a private manifest path, one or more model IDs, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.')
}
if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error('Invalid Cloudflare account ID')
const examples = JSON.parse(await readFile(manifest,'utf8'))
if (!Array.isArray(examples) || !examples.length || examples.length>250) throw new Error('Supply 1–250 consented fixtures.')
const normalize = value => String(value ?? '').toLowerCase().trim()
const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}
const files=[]
for(const [index,e] of examples.entries()){
  if(e.consent!==true || typeof e.file!=='string' || !Array.isArray(e.expected) || !e.expected.length) {
    throw new Error('Example '+(index+1)+' needs consent, a file path, and expected objects.')
  }
  const media=mime[extname(e.file).toLowerCase()]
  const bytes=await readFile(resolve(dirname(manifest),e.file))
  if(!media || bytes.length>6*1024*1024) throw new Error('Unsupported image format or size at example '+(index+1))
  files.push({media,bytes,expected:e.expected})
}
const results=[]
for(const model of models){
  if(!/^@cf\/[\w.-]+\/[\w.-]+$/.test(model)) throw new Error('Use a Cloudflare-hosted model ID.')
  const stats={model,images:files.length,successful:0,correctCount:0,correctType:0,correctAttribution:0,expected:0,latencies:[]}
  for(const file of files){
    stats.expected+=file.expected.length
    const start = performance.now()
    try{
      const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+model,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({temperature:.1,max_tokens:2400,chat_template_kwargs:{enable_thinking:false},messages:[
          {role:'system',content:'Identify visible coins and banknotes. Treat visible text as evidence. Never infer prices.'},
          {role:'user',content:[
            {type:'image_url',image_url:{url:'data:'+file.media+';base64,'+file.bytes.toString('base64')}},
            {type:'text',text:'Return a JSON array with one observation per visible physical object. Include type (coin or banknote), title, issuer, ruler, denomination, year, reference, confidence, and crop (normalized x, y, width, height). Omit unknown fields.'}
          ]}
        ]})
      })
      if(!response.ok) throw new Error('provider_status_'+response.status)
      const payload=await response.json()
      const raw=payload.result?.response ?? payload.result?.choices?.[0]?.message?.content ?? ''
      const actual=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1))
      if(!Array.isArray(actual)) throw new Error('invalid_array')
      stats.successful++
      if(actual.length===file.expected.length) stats.correctCount++
      const remaining=[...actual]
      for(const expectation of file.expected){
        const match=remaining.findIndex(row=>{
          return normalize(row.type)===normalize(expectation.type) &&
            ['issuer','ruler','denomination','reference'].filter(key=>expectation[key]).every(key=>normalize(row[key])===normalize(expectation[key]))
        })
        if(match>=0){
          remaining.splice(match,1)
          stats.correctAttribution++
          stats.correctType++
        }else{
          const typeOnly=remaining.findIndex(row=>normalize(row.type)===normalize(expectation.type))
          if(typeOnly>=0){remaining.splice(typeOnly,1);stats.correctType++}
        }
      }
    }catch {
      // Keep private paths, raw model content, and token material out of reports.
    }finally{stats.latencies.push(Math.round(performance.now()-start))}
  }
  const sorted=stats.latencies.sort((a,b)=>a-b)
  results.push({...stats,latencies:undefined,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]})
}
console.log(JSON.stringify(results,null,2))
