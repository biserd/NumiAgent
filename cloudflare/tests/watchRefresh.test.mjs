import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createServer } from 'vite'

function binding(db) {
  return {batch:async statements=>Promise.all(statements.map(s=>s.run())),prepare:sql=>({bind:(...args)=>{
    const stmt=db.prepare(sql)
    return {all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args),run:async()=>({meta:stmt.run(...args)})}
  }})}
}

test('Account guide discovers a unique issue, remembers ambiguity resolution and rechecks edited specimens',async t=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
  t.after(()=>vite.close())
  const {valuations}=await vite.ssrLoadModule('/src/worker/collection.ts')
  const {router}=await vite.ssrLoadModule('/src/worker/core.ts')
  const app=router()
  app.use('*',async(c,next)=>{c.set('user',{id:'u'});await next()})
  app.route('/valuations',valuations)
  const db=new DatabaseSync(':memory:')
  t.after(()=>db.close())
  for(const file of ['0001_initial.sql','0012_gap_watches.sql','0013_automatic_checks.sql']) db.exec(await readFile('migrations/'+file,'utf8'))
  const env={DB:binding(db),NUMISTA_API_KEY:'fixture'}
  db.exec("INSERT INTO users(id,email,created) VALUES('u','test@example.test',0)")
  db.exec("INSERT INTO items(id,user_id,type,title,issuer,denomination,year,notes,details,created,updated) VALUES('i','u','coin','Private title','Canada','5 cents','1935','Private note','{}',0,0)")
  const paths=[]
  let issues=[{id:10,year:1935},{id:11,year:1936}]
  t.mock.method(globalThis,'fetch',async url=>{
    const path=new URL(url)
    paths.push(path.pathname)
    assert.doesNotMatch(path.href,/Private|example.test/)
    if(path.pathname==='/v3/types')return Response.json({count:1,types:[{id:42,title:'5 cents',category:'coin',issuer:{name:'Canada'}}]})
    if(path.pathname.endsWith('/issues'))return Response.json(issues)
    if(path.pathname.endsWith('/sales_records'))return Response.json({sales_count:0,sales_records:[]})
    return Response.json({currency:'USD',prices:[{grade:'vf',price:2}]})
  })
  const endpoint='http://test/valuations/i/guide'
  const read=async()=> (await app.fetch(new Request(endpoint+'?auto=1'),env)).json()
  assert.equal((await read()).issueID,10)
  issues.push({id:12,year:1935,mint_letter:'S'})
  const ambiguous=await read()
  assert.equal(ambiguous.status,'choose_issue')
  assert.deepEqual(ambiguous.issues.map(i=>i.id),[10,12])
  const remember=await app.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:42,issue:12})}),env)
  assert.equal((await remember.json()).issueID,12)
  paths.length=0
  assert.equal((await read()).issueID,12)
  assert.deepEqual(paths,['/v3/types/42/issues/12/prices'])
  db.exec("UPDATE items SET year='1936' WHERE id='i'")
  const chooseType=await app.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:42})}),env)
  assert.equal((await chooseType.json()).issueID,11)
  paths.length=0
  assert.equal((await read()).issueID,11)
  assert.deepEqual(paths,['/v3/types/42/issues/11/prices'])
  const sales=async()=> (await app.fetch(new Request('http://test/valuations/i/numista-sales'),env)).json()
  paths.length=0
  assert.equal((await sales()).issueID,11)
  assert.deepEqual(paths,['/v3/types/42/sales_records'])
  db.exec("UPDATE items SET year='1935' WHERE id='i'")
  paths.length=0
  assert.equal((await sales()).status,'issue_required')
  assert.equal(paths.some(p=>p.endsWith('/sales_records')),false)
  db.exec("UPDATE items SET details='{\"mintMark\":\"S\"}' WHERE id='i'")
  assert.equal((await sales()).issueID,12)
})

test('Device-only quarter selects a type and mint before requesting sold lots within the shared quota',async t=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
  t.after(()=>vite.close())
  const {guestSales}=await vite.ssrLoadModule('/src/worker/guestSales.ts')
  const db=new DatabaseSync(':memory:')
  t.after(()=>db.close())
  for(const file of ['0001_initial.sql','0014_guest_sale_choices.sql']) db.exec(await readFile('migrations/'+file,'utf8'))
  const env={DB:binding(db),APP_ORIGIN:'https://example.test',NUMISTA_API_KEY:'fixture'}
  const search={type:'coin',issuer:'United States of America',denomination:'quarter dollar',year:'1991'}
  const request=(input,headers={})=>guestSales.fetch(new Request(env.APP_ORIGIN+'/',{method:'POST',
    headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(input)}),env)
  let lookups=0
  t.mock.method(globalThis,'fetch',async url=>{
    const path=new URL(url)
    if(path.pathname==='/v3/types'){
      assert.equal(path.searchParams.get('q'),'United States quarter')
      return Response.json({count:2,types:[{id:55,title:'¼ Dollar "Washington Quarter"',issuer:{name:'United States'}},
        {id:25416,title:'10 Dollars "American Gold Eagle" (Bullion Coinage)',issuer:{name:'United States'}}]})
    }
    if(path.pathname.endsWith('/issues'))return Response.json([{id:1,year:1990},{id:2,year:1991,mint_letter:'P'},{id:3,year:1991,mint_letter:'D'}])
    assert.equal(path.pathname,'/v3/types/55/sales_records')
    assert.equal(path.searchParams.get('issue_id'),'3')
    lookups++
    return Response.json({sales_count:0,sales_records:[]})
  })
  assert.equal((await request({...search,photos:['private']})).status,400)
  assert.equal((await request(search,{Origin:'https://elsewhere.test'})).status,403)
  assert.equal((await request(search,{Authorization:'Bearer developer'})).status,403)
  const types=await (await request(search)).json()
  assert.deepEqual(types.choices.map(c=>c.id),[55])
  const issues=await (await request({ticket:types.ticket,choice:55})).json()
  assert.deepEqual(issues.choices.map(c=>c.id),[2,3])
  assert.equal((await request({ticket:issues.ticket,choice:1})).status,400)
  assert.equal(lookups,0)
  const result=await (await request({ticket:issues.ticket,choice:3})).json()
  assert.equal(result.status,'no_matches')
  assert.equal(result.issueID,3)
  assert.equal(lookups,1)
  db.exec("UPDATE limits SET count=200 WHERE action='numista_sales' AND subject='global'")
  assert.equal((await request({ticket:issues.ticket,choice:3})).status,429)
  assert.equal(lookups,1)
  db.exec('UPDATE guest_sale_choices SET expires=0')
  assert.equal((await request({ticket:issues.ticket,choice:3})).status,404)
  assert.equal(db.prepare('SELECT count(*) AS n FROM items').get().n,0)
})

test('Scheduled gap email uses current holdings, opt-in and distinct lots',async t=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
  t.after(()=>vite.close())
  const {refreshWatchlists}=await vite.ssrLoadModule('/src/worker/market.ts')
  const {themeProgress}=await vite.ssrLoadModule('/src/worker/collection.ts')
  const db=new DatabaseSync(':memory:')
  t.after(()=>db.close())
  for (const file of ['0001_initial.sql','0012_gap_watches.sql','0013_automatic_checks.sql']) db.exec(await readFile('migrations/'+file,'utf8'))
  db.prepare("INSERT INTO users(id,email,created) VALUES('u','collector@example.test',0)").run()
  db.prepare("INSERT INTO themes VALUES('t','u','Silver denarii',?,0)").run(JSON.stringify([
    {label:'Hadrian',ruler:'Hadrian',type:'coin',metal:'Silver',aliases:[]}
  ]))
  const mail=[]
  const env={APP_ORIGIN:'https://example.test',EMAIL_FROM:'alerts@example.test',EMAIL:{send:async message=>mail.push(message)},
    MARKET_DOMAINS:'biddr.com',FIRECRAWL_API_KEY:'fixture',
    DB:binding(db)}
  const {missing:[gap]}=await themeProgress(env,'u','t')
  assert.ok(gap.slotKey)
  let calls=0
  let lot=42
  let optOutWhileSearching=false
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(String(url),'https://api.firecrawl.dev/v2/search')
    calls++
    if(optOutWhileSearching) db.exec("UPDATE gap_watches SET alert=0")
    return Response.json({success:true,data:{web:[{url:'https://www.biddr.com/example/auction?a=10&l='+lot,title:'Hadrian silver denarius'}]}})
  })
  const due=()=>db.exec('UPDATE gap_watches SET checked=NULL')
  await refreshWatchlists(env)
  assert.equal(calls,1)
  assert.equal(mail.length,0)
  const cached=db.prepare('SELECT * FROM gap_watches').get()
  assert.equal(cached.slot_key,gap.slotKey)
  assert.equal(JSON.parse(cached.last_result).lots[0].title,'Hadrian silver denarius')
  due()
  db.exec('UPDATE gap_watches SET alert=1')
  await Promise.all([refreshWatchlists(env),refreshWatchlists(env)])
  assert.equal(mail.length,1)
  assert.equal(mail[0].to,'collector@example.test')
  assert.match(mail[0].text,/biddr lead · check auction status/)
  due()
  await refreshWatchlists(env)
  assert.equal(mail.length,1)
  db.prepare("INSERT INTO items(id,user_id,type,title,ruler,details,created,updated) VALUES('i','u','coin','Denarius','Hadrian',?,0,0)").run(JSON.stringify({metal:'Silver'}))
  due()
  lot=43
  const before=calls
  await refreshWatchlists(env)
  assert.equal(calls,before)
  db.exec("DELETE FROM items WHERE id='i'")
  due()
  await refreshWatchlists(env)
  assert.equal(mail.length,2)
  lot=44
  due()
  optOutWhileSearching=true
  await refreshWatchlists(env)
  assert.equal(mail.length,2)
  db.exec("UPDATE gap_watches SET paused=1,alert=0; UPDATE checklist_auction_settings SET synced=0")
  due()
  const pausedCalls=calls
  await refreshWatchlists(env)
  assert.equal(calls,pausedCalls)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gap_watches').get().n,1)
})
