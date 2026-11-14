import { mkdtemp, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
export async function localServer(port) {
  const storage = await mkdtemp(join(tmpdir(),'numis-worker-'))
  const url = 'http://127.0.0.1:'+port
  const vars = join(storage,'test.vars')
  await writeFile(vars,'APP_MODE=test\nAPP_ORIGIN='+url+'\n')
  const env = {...process.env,WRANGLER_SEND_METRICS:'false',NODE_NO_WARNINGS:'1',WRANGLER_LOG_PATH:join(storage,'wrangler.log')}
  const init = spawn(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',storage],{env,stdio:'inherit'})
  const [code] = await once(init,'exit')
  if (code!==0) throw new Error('D1 local migration failed')
  const worker=spawn(process.execPath,[wrangler,'dev','--ip','127.0.0.1','--port',String(port),'--inspector-port',String(port+1000),'--persist-to',storage,'--env-file',vars],{env,stdio:['ignore','pipe','pipe']})
  function close() {
    if (worker.exitCode!==null) return
    if (process.platform==='win32') spawn('taskkill.exe',['/PID',String(worker.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
    else worker.kill('SIGINT')
  }
  let logs=''
  for (const stream of [worker.stdout,worker.stderr]) stream.on('data',chunk=>{logs=(logs+chunk.toString()).slice(-24000)})
  const deadline=Date.now()+65000
  while(Date.now()<deadline) {
    if(worker.exitCode!==null) throw new Error(logs)
    try { if ((await fetch(url+'/api/v1/health',{signal:AbortSignal.timeout(3000)})).ok) return {url,logs:()=>logs,close} }
    catch {}
    await new Promise(resolve=>setTimeout(resolve,400))
  }
  close()
  throw new Error('Worker startup timed out. '+logs)
}
