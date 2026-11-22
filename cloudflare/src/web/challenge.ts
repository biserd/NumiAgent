type Widget = {
  render:(target:HTMLElement, options:Record<string,unknown>)=>string
  reset:(id:string)=>void
  remove:(id:string)=>void
}
const loaded = () => (window as Window & {turnstile?:Widget}).turnstile
let loading:Promise<Widget>|undefined

async function load() {
  const widget=loaded()
  if (widget) return widget
  loading ??= new Promise<Widget>((resolve,reject)=>{
    const script=document.createElement('script')
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async=true
    script.onload=()=>{
      const ready=loaded()
      if (ready) resolve(ready)
      else reject(new Error('The security challenge could not load. Reload the page to try again.'))
    }
    script.onerror=()=>reject(new Error('The security challenge could not load. Reload the page to try again.'))
    document.head.appendChild(script)
  })
  return loading
}

export async function mountChallenge(target:HTMLElement,sitekey:string,action:'login'|'contact'|'launch_waitlist',update:(token:string)=>void) {
  const widget=await load()
  if (!target.isConnected) return null
  const id=widget.render(target,{sitekey,action,callback:update,'expired-callback':()=>update(''),'error-callback':()=>update('')})
  return {reset:()=>widget.reset(id),remove:()=>widget.remove(id)}
}
