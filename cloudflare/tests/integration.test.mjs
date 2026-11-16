import assert from 'node:assert/strict'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { test } from 'node:test'
import { localServer } from './server.mjs'

const fixture = (serial, addText = false) => {
  const chunk=(tag,value)=>{
    const length=Buffer.alloc(4);length.writeUInt32BE(value.length)
    const typed=Buffer.concat([Buffer.from(tag),value])
    const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(typed))
    return Buffer.concat([length,typed,crc])
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(2,4);header[8]=8;header[9]=2
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),
    chunk('IDAT',deflateSync(Buffer.from([0,12,12,12,serial,5,3,0,4,5,6,7,8,9]))),
    ...(addText ? [chunk('tEXt',Buffer.from([120,0,121]))] : []),chunk('IEND',Buffer.alloc(0))])
}
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms))
test('Wrangler end to end: bulk ingestion, tenant isolation, sale evidence, Roman checklist and scoped MCP', {timeout:300000}, async t=>{
  const server=await localServer(8791)
  t.after(()=>server.close())
  const base=server.url
  const api=(path,credential,method='GET',value)=>{
    const blob=value instanceof Uint8Array
    return fetch(base+'/api/v1'+path,{method,headers:{
      Origin:base,...(credential ? {Cookie:credential}:{}),
      ...(value===undefined ? {}:{'Content-Type':blob?'image/png':'application/json'})
    },body:value===undefined ? undefined:blob?value:JSON.stringify(value)})
  }
  const json=async (response,status=200)=>{
    const data=await response.json()
    assert.equal(response.status,status,JSON.stringify(data))
    return data
  }
  async function login(email, requestPath='/auth/request'){
    const initial=await json(await api(requestPath,null,'POST',{email}),202)
    const token=new URL(initial.developmentLink).hash.slice(8)
    const verified=await api('/auth/verify',null,'POST',{token})
    assert.equal(verified.status,200,await verified.text())
    assert.equal((await api('/auth/verify',null,'POST',{token})).status,400)
    return verified.headers.get('set-cookie').split(';')[0]
  }
  try {
    const sitemap=await (await fetch(base+'/sitemap.xml')).text()
    assert.equal((await api('/internal/photo-release',null,'POST',{})).status,401)
    const landing=await (await fetch(base+'/')).text()
    assert.match(landing,/id="app" data-rendered="server"/)
    assert.match(landing,/class="hero-art"/)
    assert.match(landing,/aria-label="Collector guides"/)
    assert.match(landing,/Coin &amp; Banknote Collection Software/)
    for(const issue of ['Too many photos to sort?','Stuck on an unfamiliar piece?','Unsure what it’s worth?','What’s still missing?']){
      assert.ok(landing.includes(issue),issue)
    }
    for(const [path,heading] of [['/about','About NumiAgent'],['/features','NumiAgent features'],['/terms','Terms of Service'],['/privacy','Privacy Policy'],['/help','Collector guide'],['/contact','Contact NumiAgent'],
      ['/developers','NumiAgent for developers'],['/developers/access','API and MCP access'],['/developers/api','REST API guide'],['/developers/mcp','MCP connection guide']]){
      const response=await fetch(base+path)
      assert.equal(response.status,200)
      const markup=await response.text()
      assert.ok(markup.includes('<h1>'+heading+'</h1>'))
      assert.ok(markup.includes('https://numiagent.com'+path))
      assert.ok(sitemap.includes('<loc>https://numiagent.com'+path+'</loc>'))
    }
    assert.ok(!sitemap.includes('<loc>https://numiagent.com/app'))
    const blog=(await fetch(base+'/blog'))
    assert.equal(blog.status,200)
    const posts=Array.from((await blog.text()).matchAll(/href="(\/blog\/[^"]+)"/g),match=>match[1])
      .filter(path=>path!=='/blog/rss.xml')
    assert.equal(new Set(posts).size,6)
    assert.ok(sitemap.includes('<loc>https://numiagent.com/blog</loc>'))
    const feed=await fetch(base+'/blog/rss.xml')
    assert.equal(feed.status,200)
    assert.match(feed.headers.get('content-type'),/application\/rss\+xml/)
    const rss=await feed.text()
    for(const path of new Set(posts)){
      assert.ok(sitemap.includes('<loc>https://numiagent.com'+path+'</loc><lastmod>2026-11-15</lastmod>'))
      assert.ok(rss.includes('<guid>https://numiagent.com'+path+'</guid>'))
      const article=await fetch(base+path)
      assert.equal(article.status,200)
      const markup=await article.text()
      const isNew=['/blog/identify-roman-coins','/blog/catalog-banknote-collection'].includes(path)
      const published=isNew ? '2026-11-15' : '2026-11-14'
      assert.ok(markup.includes('<time datetime="'+published+'">'))
      assert.match(markup,/id="app" data-rendered="server"/)
      assert.match(markup,/"@type":"BlogPosting"/)
      assert.match(markup,/"@type":"BreadcrumbList"/)
      assert.match(markup,/"dateModified":"2026-11-15"/)
      assert.match(markup,/<nav[^>]*aria-label="Breadcrumb"[^>]*>.*?href="\/blog"/s)
      const articleBody=markup.split('<div class="information-content wrap">')[1].split('<aside')[0]
      assert.match(articleBody,/<p>(?:(?!<\/p>).)*<a href="\/features#[a-z-]+"/s)
      const peers=new Set(Array.from(articleBody.matchAll(/href="(\/blog\/[^"]+)"/g),match=>match[1]))
      assert.ok(peers.size>=2 && [...peers].every(peer=>peer!==path && posts.includes(peer)))
    }
    const normalized=await fetch(base+'/blog/?source=test',{redirect:'manual'})
    assert.equal(normalized.status,308)
    assert.equal(normalized.headers.get('Location'),base+'/blog?source=test')
    const robots=await (await fetch(base+'/robots.txt')).text()
    assert.match(robots,/Sitemap: https:\/\/numiagent\.com\/sitemap\.xml/)
    assert.doesNotMatch(robots,/Disallow: \/app/)
    assert.match(await (await fetch(base+'/app')).text(),/<meta name="robots" content="noindex">/)
    assert.equal((await fetch(base+'/404')).status,404)
    const manifest=await json(await fetch(base+'/developers/mcp/server.json'))
    assert.equal(manifest.name,'com.numiagent/numiagent')
    assert.deepEqual(manifest.remotes,[{type:'streamable-http',url:'https://numiagent.com/mcp'}])
    const proof=await fetch(base+'/.well-known/mcp-registry-auth',{redirect:'manual'})
    assert.equal(proof.status,200)
    assert.match(await proof.text(),/^v=MCPv1; k=ed25519; p=/)
    assert.equal((await fetch(base+'/nonexistent-numiagent-page')).status,404)
    const contact={email:'integration-contact@example.test',topic:'Report an issue',message:'Test message from an anonymous visitor.'}
    assert.equal((await api('/contact',null,'POST',{...contact,email:'invalid-address'})).status,400)
    const receipt=await json(await api('/contact',null,'POST',contact),201)
    assert.match(receipt.reference,/^[0-9a-f-]{36}$/)
    assert.equal((await api('/contact')).status,401)
    assert.equal((await api('/items')).status,401)
    const a=await login('collector@example.test')
    const b=await login('another@example.test','/auth/native/request')
    const invalidNativeOrigin=await fetch(base+'/api/v1/auth/native/request',{method:'POST',
      headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify({email:'nobody@example.test'})})
    assert.equal(invalidNativeOrigin.status,403)
    const openapi=await json(await fetch(base+'/openapi.json'))
    assert.ok(openapi.paths['/items'].get.security.some(entry=>entry.developerKey))
    assert.deepEqual(openapi.paths['/items'].post.security,[{session:[]}])
    const key=await json(await api('/me/developer-keys',a,'POST',{label:'Catalog integration'}),201)
    const otherKey=await json(await api('/me/developer-keys',b,'POST',{label:'Other account'}),201)
    assert.match(key.secret,/^na_live_[0-9a-f]{64}$/)
    assert.ok(key.expires>key.created)
    assert.deepEqual(await json(await api('/me/developer-keys',a)),[{
      id:key.id,label:key.label,scope:'collection:read',created:key.created,expires:key.expires
    }])
    const usingKey=(path,secret=key.secret,method='GET',headers={})=>fetch(base+'/api/v1'+path,{
      method,headers:{Authorization:'Bearer '+secret,...headers}
    })
    assert.equal((await usingKey('/items','bad', 'GET',{Cookie:a})).status,401)
    assert.equal((await usingKey('/items',key.secret,'POST',{Cookie:a,Origin:base})).status,403)
    assert.equal((await usingKey('/me/developer-keys')).status,403)
    assert.equal((await usingKey('/items/export.csv')).status,403)
    assert.equal((await api('/me/developer-keys/'+key.id,b,'DELETE')).status,204)
    assert.equal((await usingKey('/items')).status,200)
    const invalid=await fetch(base+'/api/v1/items',{method:'POST',headers:{Cookie:a,Origin:'https://different.example'},body:'{}'})
    assert.equal(invalid.status,403)
    const id=randomUUID()
    await json(await api('/imports',a,'POST',{id,label:'Synthetic batch',analyze:true,consent:true}),201)
    const ids=[]
    for(let i=0;i<101;i+=6) {
      await Promise.all(Array.from({length:Math.min(6,101-i)},async (_,offset)=>{
        const photo=await json(await api('/imports/'+id+'/photos',a,'PUT',fixture(i+offset)),201)
        ids[i+offset]=photo.id
      }))
    }
    const retry=await json(await api('/imports/'+id+'/photos',a,'PUT',fixture(0)))
    assert.equal(retry.id,ids[0])
    assert.equal((await api('/photos/'+ids[0],b)).status,404)
    assert.equal((await api('/photos/'+ids[0],a)).status,200)
    let batch
    for(let j=0;j<110;j++) {
      batch=await json(await api('/imports/'+id,a))
      if (batch.photos.every(p=>p.state==='review')) break
      await wait(1000)
    }
    assert.equal(batch.photos.length,101)
    const states=batch.photos.reduce((counts,photo)=>({...counts,[photo.state]:(counts[photo.state] ?? 0)+1}),{})
    assert.deepEqual(states,{review:101},server.logs())
    assert.ok(batch.photos.every(p=>p.candidates[0].title==='Synthetic test candidate'))
    const manual=randomUUID()
    await json(await api('/imports',a,'POST',{id:manual,label:'Saved without AI',analyze:false,consent:false}),201)
    await json(await api('/imports/'+manual+'/photos',a,'PUT',fixture(150)),201)
    const manualRoute='/imports/'+manual+'/analyze'
    const summary=(await json(await api('/imports',a))).find(row=>row.id===manual)
    assert.equal(summary.manual,1)
    assert.equal(summary.pending,0)
    assert.equal((await api(manualRoute,a,'POST',{consent:false})).status,400)
    assert.equal((await api(manualRoute,b,'POST',{consent:true})).status,404)
    assert.equal((await json(await api('/imports/'+manual,a))).photos[0].state,'manual')
    assert.deepEqual(await json(await api(manualRoute,a,'POST',{consent:true}),202),{queued:1})
    assert.deepEqual(await json(await api(manualRoute,a,'POST',{consent:true}),202),{queued:0})
    let reconsidered
    for(let j=0;j<30;j++) {
      reconsidered=await json(await api('/imports/'+manual,a))
      if (reconsidered.photos[0].state==='review') break
      await wait(1000)
    }
    assert.equal(reconsidered.photos[0].state,'review',server.logs())
    assert.equal((await json(await api('/imports',a))).find(row=>row.id===manual).suggestions,1)
    const automatic=randomUUID()
    const registration={id:automatic,label:'Automatic catalog fixture',analyze:true,consent:true,autoCatalog:true}
    await json(await api('/imports',a,'POST',registration),201)
    assert.equal((await api('/imports',a,'POST',{...registration,autoCatalog:false})).status,409)
    // Equal fixture dimensions with different byte lengths let the test model return one clear match and one uncertain match.
    const clearImage=fixture(170)
    const unclearImage=fixture(170,true)
    const complete=clearImage.length%2===0 ? clearImage : unclearImage
    const uncertain=clearImage.length%2!==0 ? clearImage : unclearImage
    const goodPhoto=await json(await api('/imports/'+automatic+'/photos',a,'PUT',complete),201)
    const checkPhoto=await json(await api('/imports/'+automatic+'/photos',a,'PUT',uncertain),201)
    let automaticBatch
    for(let j=0;j<30;j++) {
      automaticBatch=await json(await api('/imports/'+automatic,a))
      if (automaticBatch.photos.some(p=>p.state==='saved') && automaticBatch.photos.some(p=>p.state==='review')) break
      await wait(1000)
    }
    const accepted=automaticBatch.photos.find(p=>p.id===goodPhoto.id)
    const review=automaticBatch.photos.find(p=>p.id===checkPhoto.id)
    assert.equal(accepted.state,'saved',server.logs())
    assert.equal(review.state,'review')
    assert.equal(review.record,null)
    assert.deepEqual(accepted.record,{id:goodPhoto.id,title:'2007 Jefferson nickel',type:'coin',year:'2007',issuer:'United States',denomination:'5 cents'})
    const nickel=await json(await api('/items/'+accepted.record.id,a))
    assert.deepEqual(nickel.photos,[{photoId:goodPhoto.id,side:'overview',crop:null}])
    assert.equal((await api('/items/'+nickel.id,b)).status,404)
    assert.deepEqual(await json(await api('/imports/'+automatic+'/photos',a,'PUT',complete)),{id:goodPhoto.id,state:'saved'})
    assert.equal((await json(await api('/items?q=Jefferson',a))).items.length,1)
    assert.equal((await api('/items/'+nickel.id,a,'DELETE')).status,204)
    assert.equal((await json(await api('/imports/'+automatic,a))).photos.find(p=>p.id===goodPhoto.id).record,null)
    const paired = randomUUID()
    const pairRoute = '/imports/'+paired
    await json(await api('/imports',a,'POST',{...registration,id:paired,label:'Both sides of one coin',paired:true}),201)
    assert.equal((await api(pairRoute+'/photos',a,'PUT',fixture(171))).status,400)
    const front=await json(await api(pairRoute+'/photos?side=obverse',a,'PUT',fixture(171)),201)
    assert.equal(front.state,'manual')
    assert.equal((await api(pairRoute+'/photos?side=reverse',a,'PUT',fixture(171))).status,409)
    assert.equal((await api(pairRoute+'/photos?side=obverse',a,'PUT',fixture(172))).status,409)
    const back=await json(await api(pairRoute+'/photos?side=reverse',a,'PUT',fixture(172)),201)
    let pair
    for(let j=0;j<30;j++) {
      pair=await json(await api(pairRoute,a))
      if (pair.photos.every(photo=>photo.state==='saved')) break
      await wait(1000)
    }
    assert.deepEqual(pair.photos.map(photo=>photo.state),['saved','saved'], server.logs().slice(-2000))
    assert.deepEqual(pair.photos.map(photo=>photo.record.id),[front.id,front.id])
    const pairedCoin=await json(await api('/items/'+front.id,a))
    assert.equal(pairedCoin.issuer,'Hong Kong')
    assert.equal(pairedCoin.year,'1998')
    assert.equal(pairedCoin.denomination,'1 dollar')
    assert.deepEqual(Object.fromEntries(pairedCoin.photos.map(photo=>[photo.side,photo.photoId])),{obverse:front.id,reverse:back.id})
    assert.equal((await api('/items/'+back.id,a)).status,404)
    assert.equal((await api('/imports/refine/'+front.id,b,'POST',{})).status,404)
    const refined=await json(await api('/imports/refine/'+front.id,a,'POST',{}))
    assert.equal(refined.candidates[0].title,pairedCoin.title)
    assert.deepEqual((await json(await api('/items/'+front.id,a))).photos,pairedCoin.photos)
    await json(await api(pairRoute+'/photos?side=reverse',a,'PUT',fixture(172)))
    assert.equal((await json(await api('/items?q=1998 Hong Kong',a))).items.length,1)
    const saved=await json(await api('/items',a,'POST',{title:'Trajan denarius',ruler:'Trajan',type:'coin',grade:'VF',details:{metal:'Silver'},
      photos:[{photoId:ids[0],side:'obverse'},{photoId:ids[1],side:'reverse'}]}),201)
    const foreign=await json(await api('/items',b,'POST',{title:'Other private specimen',type:'coin'}),201)
    assert.equal((await api('/items/bulk',a,'PATCH',{ids:[saved.id,foreign.id],changes:{tags:'Do not apply'}})).status,404)
    assert.equal((await json(await api('/items/'+saved.id,a))).tags,'')
    assert.deepEqual(await json(await api('/items/bulk',a,'PATCH',{ids:[saved.id],changes:{tags:'Silver collection'}})),{updated:1})
    const patched=await json(await api('/items/'+saved.id,a))
    assert.equal(patched.tags,'Silver collection')
    assert.equal(patched.grade,'VF')
    assert.equal(patched.photos.length,2)
    assert.equal((await api('/items/'+saved.id,b)).status,404)
    assert.equal((await json(await api('/items?q=trajan',a))).items.length,1)
    assert.equal((await json(await usingKey('/items?q=trajan'))).items[0].id,saved.id)
    assert.equal((await usingKey('/items/'+saved.id,otherKey.secret)).status,404)
    assert.equal((await usingKey('/photos/'+ids[0],otherKey.secret)).status,404)
    assert.equal((await usingKey('/photos/'+ids[0])).status,200)
    assert.equal((await api('/me/developer-keys/'+key.id,a,'DELETE')).status,204)
    assert.equal((await usingKey('/items')).status,401)
    assert.equal((await json(await api('/valuations/'+saved.id,a))).status,'insufficient_market_evidence')
    const synthetic=Array.from({length:3},(_,index)=>({
      url:'https://example.test/synthetic/lot'+index,date:new Date().toISOString().slice(0,10),currency:'USD',amount:100+index*10,
      basis:'hammer',premium:20,grade:'VF',match:'strong',house:'Synthetic Test House',auction:'Example auction',lot:String(index),sourceChecked:true
    }))
    const price=await json(await api('/valuations/'+saved.id+'/sales',a,'POST',synthetic),201)
    assert.equal(price.range.median,132)
    assert.equal(price.evidence.length,3)
    assert.equal((await json(await api('/items/statistics',a))).portfolio.valuedItems,1)
    const insurance=await api('/items/insurance.csv',a)
    assert.match(insurance.headers.get('Content-Disposition'),/insurance-inventory/)
    const inventory=await insurance.text()
    assert.match(inventory,/assessment_status.*estimate_median.*private_photo_urls/)
    assert.ok(inventory.includes('Trajan denarius') && inventory.includes('/api/v1/photos/'+ids[0]))
    assert.ok(!inventory.includes('Other private specimen'))
    assert.equal((await json(await api('/valuations/'+saved.id+'/research',a))).status,'provider_not_configured')
    const keeping=await json(await api('/items',a,'POST',{title:'Hong Kong coin',type:'coin',issuer:'Hong Kong',
      details:{metal:''},photos:[{photoId:ids[32],side:'overview'}]}),201)
    const otherSide=await json(await api('/items',a,'POST',{title:'ONE DOLLAR',type:'coin',year:'1998',denomination:'1 dollar',
      grade:'VF',notes:'Back side notes',details:{metal:'Copper-nickel'},photos:[{photoId:ids[33],side:'overview'}]}),201)
    await json(await api('/valuations/'+otherSide.id+'/sales',a,'POST',[synthetic[0]]),201)
    assert.equal((await api('/items/'+keeping.id+'/merge',a,'POST',{sourceId:foreign.id})).status,404)
    const merged=await json(await api('/items/'+keeping.id+'/merge',a,'POST',{sourceId:otherSide.id}))
    assert.equal(merged.year,'1998')
    assert.equal(merged.issuer,'Hong Kong')
    assert.equal(merged.denomination,'1 dollar')
    assert.equal(merged.notes,'Back side notes')
    assert.equal(merged.details.metal,'Copper-nickel')
    assert.deepEqual(Object.fromEntries(merged.photos.map(p=>[p.side,p.photoId])),{obverse:ids[32],reverse:ids[33]})
    assert.equal((await api('/items/'+otherSide.id,a)).status,404)
    assert.equal((await json(await api('/valuations/'+keeping.id,a))).evidence[0].url,synthetic[0].url)
    assert.equal((await json(await api('/valuations/'+keeping.id+'/history',a))).length,1)
    assert.equal((await api('/references/ocre?id=https%3A%2F%2Fexample.test%2Fwrong',a)).status,400)
    assert.equal((await api('/exchange-rates?from=USD&to=USD&date=2026-11-13',a)).status,400)
    const canada=await json(await api('/themes/preview',a,'POST',{goal:'1935 Canadian banknotes'}))
    assert.equal(canada.status,'template')
    assert.equal(canada.slots.length,10)
    assert.ok(canada.slots.some(rule=>rule.denomination==='$25' && rule.source.includes('bankofcanada.ca')))
    const cng = 'https://www.cngcoins.com/Lot.aspx?BACK_URL=%2FLots.aspx%3FAUCTION_ID%3D243%26PAGE%3D4%26PAGE_NUM%3D200&LOT_ID=212313'
    const specimen = await json(await api('/items',a,'POST',{title:'Vespasian denarius',reference:'RIC II.1 980',type:'coin',grade:'Near EF'}),201)
    const real = await json(await api('/valuations/'+specimen.id+'/sales',a,'POST',[{
      url:cng,date:'2026-10-21',currency:'USD',amount:550,basis:'hammer',premium:20,
      grade:'Near EF',match:'strong',house:'CNG',auction:'Electronic Auction 619',lot:'715',sourceChecked:true
    }]),201)
    assert.equal(real.status,'insufficient_market_evidence')
    assert.equal(real.evidence[0].url,cng)
    assert.equal(real.evidence[0].amount,550)
    const preview=await json(await api('/themes/preview',a,'POST',{goal:'A silver coin for each first-century Roman emperor'}))
    const theme=await json(await api('/themes',a,'POST',{name:preview.name,slots:preview.slots}),201)
    const progress=await json(await api('/themes/'+theme.id,a))
    assert.equal(progress.owned,1)
    assert.equal(progress.missing.length,12)
    assert.equal(progress.priorities.length,3)
    assert.equal(progress.missingReferences,1)
    assert.equal((await json(await api('/market/search?q=Trajan',a))).status,'unavailable')
    assert.ok((await (await api('/items/export.csv',a)).text()).includes('Trajan denarius'))

    const legacy={id:randomUUID(),title:'Legacy Hadrian coin',ruler:'Hadrian',obvImageId:randomUUID(),
      weightG:'2.380',axis:6,dateFrom:119,dateTo:121,obvLegend:'IMP CAESAR',userId:'legacy-user'}
    const [folder]=await json(await api('/collections',a))
    const transfer={coins:[legacy],collectionId:folder.id}
    const importPath='/items/import/numisgraph'
    assert.equal((await api(importPath,b,'POST',transfer)).status,404)
    assert.deepEqual(await json(await api(importPath,a,'POST',transfer),201),{imported:1,skipped:0,legacyPhotoLinks:1})
    const [migrated]=(await json(await api('/items?q=Legacy%20Hadrian',a))).items
    assert.equal(migrated.details.weightG,2.38)
    assert.equal(migrated.details.dateFrom,119)
    assert.equal(migrated.details.obverseLegend,'IMP CAESAR')
    const migratedPath='/items/'+migrated.id
    assert.equal((await api(migratedPath,a,'PUT',{...migrated,title:'Edited Hadrian coin',photos:[{photoId:ids[2],side:'obverse',crop:null}]})).status,204)
    assert.deepEqual(await json(await api(importPath,a,'POST',transfer),201),{imported:0,skipped:1,legacyPhotoLinks:1})
    const edited=await json(await api(migratedPath,a))
    assert.equal(edited.title,'Edited Hadrian coin')
    assert.equal(edited.photos[0].photoId,ids[2])
    assert.equal((await api(migratedPath,b)).status,404)
    const [caligula]=await json(await api('/references?q=Caligula&kind=ruler',a))
    assert.equal(caligula.source,'https://nomisma.org/id/gaius')

    const unauthorized=await fetch(base+'/mcp')
    assert.equal(unauthorized.status,401)
    assert.match(unauthorized.headers.get('www-authenticate'),/resource_metadata/i)
    const metadata=await json(await fetch(base+'/.well-known/oauth-authorization-server'))
    const redirectUri='http://127.0.0.1:8799/callback'
    const client=await json(await fetch(metadata.registration_endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({client_name:'Integration test',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',
        grant_types:['authorization_code','refresh_token'],response_types:['code']})}),201)
    const verifier=randomBytes(40).toString('base64url')
    const authorize=new URL(metadata.authorization_endpoint)
    authorize.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirectUri,response_type:'code',
      code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',
      state:'integration-state',scope:'collection:read',resource:base+'/mcp'}).toString()
    const consentPage=await fetch(authorize,{headers:{Cookie:a}})
    assert.equal(consentPage.status,200,await consentPage.text())
    const consent=await fetch(authorize,{method:'POST',headers:{Cookie:a,Origin:base},redirect:'manual'})
    assert.equal(consent.status,303,await consent.text())
    const callback=new URL(consent.headers.get('location'))
    assert.equal(callback.searchParams.get('state'),'integration-state')
    const token=await json(await fetch(metadata.token_endpoint,{method:'POST',body:new URLSearchParams({
      grant_type:'authorization_code',code:callback.searchParams.get('code'),client_id:client.client_id,
      redirect_uri:redirectUri,code_verifier:verifier,resource:base+'/mcp'
    })}))
    const transport=async (method,params,requestId)=>{
      const response=await fetch(base+'/mcp',{method:'POST',headers:{
        Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',
        Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'
      },body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})})
      const text=await response.text()
      assert.equal(response.status,200,text)
      return JSON.parse(text.startsWith('{') ? text:text.split('\n').find(line=>line.startsWith('data: ')).slice(6))
    }
    const initialize=await transport('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'integration',version:'1'}},1)
    assert.ok(initialize.result.serverInfo.name)
    const tools=(await transport('tools/list',{},2)).result.tools
    assert.equal(tools.length,10)
    for(const [index,name,args,verify] of [
      [3,'search_my_collection',{query:'Trajan'},data=>assert.equal(data.items.length,1)],
      [4,'get_missing_items',{themeId:theme.id},data=>assert.equal(data.missing.length,12)],
      [5,'get_valuation',{itemId:saved.id},data=>assert.equal(data.range.median,132)],
      [6,'search_market',{query:'Trajan'},data=>assert.equal(data.status,'unavailable')]
    ]) {
      const result=await transport('tools/call',{name,arguments:args},index)
      assert.ok(result.result,JSON.stringify(result))
      verify(result.result.structuredContent.data)
    }
    const [grant]=await json(await api('/me/grants',a))
    assert.equal((await api('/me/grants/'+grant.id,a,'DELETE')).status,204)
    assert.equal((await fetch(base+'/mcp',{headers:{Authorization:'Bearer '+token.access_token}})).status,403)
    assert.equal((await api('/me',a,'DELETE',{confirm:'DELETE'})).status,202)
    assert.equal((await api('/me',a)).status,401)
    assert.equal((await api('/me',b,'DELETE',{confirm:'DELETE'})).status,202)
    assert.equal((await usingKey('/items',otherKey.secret)).status,401)
    const cron=await fetch(base+'/cdn-cgi/local/scheduled')
    assert.equal(cron.status,200,await cron.text())
  } catch(error) {
    console.error(server.logs().replace(/numis_session=[a-f0-9]+/g,'[redacted]'))
    throw error
  }
})
