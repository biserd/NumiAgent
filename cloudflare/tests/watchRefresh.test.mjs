import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createServer } from 'vite'

test('Scheduled gap email uses current holdings, opt-in and distinct lots',async t=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
  t.after(()=>vite.close())
  const {refreshWatchlists}=await vite.ssrLoadModule('/src/worker/market.ts')
  const {themeProgress}=await vite.ssrLoadModule('/src/worker/collection.ts')
  const db=new DatabaseSync(':memory:')
  t.after(()=>db.close())
  for (const file of ['0001_initial.sql','0012_gap_watches.sql']) db.exec(await readFile('migrations/'+file,'utf8'))
  db.prepare("INSERT INTO users(id,email,created) VALUES('u','collector@example.test',0)").run()
  db.prepare("INSERT INTO themes VALUES('t','u','Silver denarii',?,0)").run(JSON.stringify([
    {label:'Hadrian',ruler:'Hadrian',type:'coin',metal:'Silver',aliases:[]}
  ]))
  const mail=[]
  const env={APP_ORIGIN:'https://example.test',EMAIL_FROM:'alerts@example.test',EMAIL:{send:async message=>mail.push(message)},
    MARKET_DOMAINS:'biddr.com',FIRECRAWL_API_KEY:'fixture',
    DB:{prepare:sql=>({bind:(...args)=>{
      const stmt=db.prepare(sql)
      return {all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args),run:async()=>({meta:stmt.run(...args)})}
    }})}}
  const {missing:[gap]}=await themeProgress(env,'u','t')
  db.prepare("INSERT INTO gap_watches(id,user_id,theme_id,slot_key,query) VALUES('w','u','t',?,?)").run(gap.slotKey,gap.query)
  let calls=0
  let lot=42
  let optOutWhileSearching=false
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(String(url),'https://api.firecrawl.dev/v2/search')
    calls++
    if(optOutWhileSearching) db.exec("UPDATE gap_watches SET alert=0")
    return Response.json({success:true,data:{web:[{url:'https://www.biddr.com/auctions/example/browse?a=10&l='+lot,title:'Hadrian silver denarius'}]}})
  })
  const due=()=>db.exec('UPDATE gap_watches SET checked=NULL')
  await refreshWatchlists(env)
  assert.equal(calls,0)
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
})
