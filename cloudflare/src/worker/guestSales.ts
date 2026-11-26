import { z } from 'zod'
import { body, digest, fail, limit, now, one, router, run, sameOrigin, token } from './core'
import type { Env } from './core'
import { discoverGuideType, numistaGuide } from './numistaGuide'
import { numistaSales } from './numistaSales'

const terms = z.object({type:z.enum(['coin','banknote']),issuer:z.string().trim().min(1).max(80),
  denomination:z.string().trim().min(1).max(80),year:z.string().trim().regex(/^-?\d{1,4}$/)}).strict()
const pick = z.object({ticket:z.string().regex(/^[a-f0-9]{64}$/),choice:z.number().int().positive()}).strict()
type Choice = { id:number; label:string }
type Selection = { step:'type'; year:string; allowed:number[] } |
  { step:'issue'; typeID:number; allowed:number[] } | { step:'page'; typeID:number; issueID:number; allowed:number[] }

// Tickets contain only catalog IDs and the lookup year, never lot data, photos or a record identifier.
async function ticket(env:Env,selection:Selection) {
  const value=token()
  await run(env,'INSERT INTO guest_sale_choices(ticket_hash,expires,selection) VALUES(?,?,?)',
    await digest(value),now()+900,JSON.stringify(selection))
  return value
}
async function quota(env:Env,ip:string,kind:'guide'|'sales') {
  const action='numista_'+kind
  await limit(env,'guest_'+action,ip,kind==='guide'?20:10)
  await limit(env,'guest_'+action,'global',kind==='guide'?80:40)
  await limit(env,action,'global',kind==='guide'?400:200)
}
const unavailable={status:'unavailable',message:'Numista could not complete this lookup. Try again later.'}
async function lots(env:Env,key:string,ip:string,typeID:number,issueID:number,page:number) {
  await quota(env,ip,'sales')
  const result=await numistaSales(key,typeID,issueID,page)
  if (!('nextPage' in result) || !result.nextPage) return result
  return {...result,ticket:await ticket(env,{step:'page',typeID,issueID,allowed:[result.nextPage]})}
}
async function issues(env:Env,key:string,ip:string,typeID:number,year:string) {
  await quota(env,ip,'guide')
  const guide=await numistaGuide(key,typeID,undefined,'USD')
  if (!('issues' in guide)) return unavailable
  const date=Number(year)
  const options=guide.issues.filter(row=>[row.year,row.gregorian_year].some(y=>y!=null && Number(y)===date) ||
    (row.min_year!=null && row.max_year!=null && date>=row.min_year && date<=row.max_year))
  if (options.length===1) return lots(env,key,ip,typeID,options[0].id,1)
  const base={typeID,source:guide.source}
  if (!options.length) return {...base,status:'no_matches',message:'Numista lists no matching issue for this year.'}
  return {...base,status:'choose_issue',message:'Choose the mint or variety that matches your piece.',
    choices:options.map(({id,label})=>({id,label})),ticket:await ticket(env,{step:'issue',typeID,allowed:options.map(o=>o.id)})}
}

// A foreground lookup for one piece. Continuations can request only choices offered by the previous screen.
export const guestSales=router()
guestSales.post('/',async c=>{
  sameOrigin(c)
  if(c.req.header('Authorization')) return fail(403,'Use the device collection screen for this lookup')
  const input=await body(c,z.union([terms,pick]))
  const ip=await digest(c.req.header('CF-Connecting-IP') ?? 'local')
  await limit(c.env,'guest_sales_requests',ip,60,3600)
  const key=c.env.NUMISTA_API_KEY
  if (!key) return c.json({status:'unavailable',message:'Numista sales lookup is currently unavailable.'})
  if ('ticket' in input) {
    const row=await one<{selection:string}>(c.env,'SELECT selection FROM guest_sale_choices WHERE ticket_hash=? AND expires>?',
      await digest(input.ticket),now())
    if (!row) return fail(404,'This lookup expired. Start a new search.')
    const selected:Selection=JSON.parse(row.selection)
    if (!selected.allowed.includes(input.choice)) return fail(400,'Select one of the offered choices')
    if (selected.step==='type') return c.json(await issues(c.env,key,ip,input.choice,selected.year))
    if (selected.step==='issue') return c.json(await lots(c.env,key,ip,selected.typeID,input.choice,1))
    return c.json(await lots(c.env,key,ip,selected.typeID,selected.issueID,input.choice))
  }
  const us=/^(united states(?: of america)?|usa|u\.s\.)$/i.test(input.issuer)
  const coins:Record<string,string>={'quarter dollar':'quarter','five cents':'5 cents','one dime':'dime','one cent':'cent'}
  const hints=us ? {...input,issuer:'United States',denomination:input.type==='coin' ?
    (coins[input.denomination.toLowerCase()] ?? input.denomination) : input.denomination} : input
  await quota(c.env,ip,'guide')
  const found=await discoverGuideType(key,hints)
  if (found.status!=='reference_required') return c.json(unavailable)
  let choices:Choice[]=found.candidates ?? []
  if (us && hints.type==='coin' && /^(?:quarter|quarter dollar|25 cents)$/i.test(hints.denomination)) {
    // Numista also matches "quarter ounce" bullion. Require the denomination in the catalog title.
    choices=choices.filter(option=>/¼\s*dollar|1\/4\s*dollar|\b25\s*cents?\b|\bquarter dollar\b|\bwashington quarter\b/i.test(option.label))
  }
  if (!choices.length) return c.json({status:'no_matches',message:'Numista found no matching catalog types. Check your search details.'})
  return c.json({status:'choose_type',message:'Choose the catalog type that matches your piece.',choices,
    ticket:await ticket(c.env,{step:'type',year:input.year,allowed:choices.map(o=>o.id)})})
})
