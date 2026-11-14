<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Landing from './Landing.vue'
import Catalog from './Catalog.vue'
import ImportView from './ImportView.vue'
import GoalsMarket from './GoalsMarket.vue'
import Settings from './Settings.vue'
import { message, request } from './api'
const onLanding = location.pathname==='/'
const routes = ['Overview','Collection','Imports','Themes','Marketplace','Settings'] as const
type Page = typeof routes[number]
const readPage = ():Page => routes.find(r=>r.toLowerCase()===location.hash.slice(1)) ?? 'Overview'
const page = ref<Page>(readPage())
const user = ref<{email:string;id:string}|null>(null)
const email = ref('')
const error = ref('')
const status = ref('')
const marketQuery = ref('')
const busy = ref(false)
const checking = ref(!onLanding)
const developmentLink = ref('')
const turnstileKey = ref<string|null>(null)
const challenge = ref('')
const stats = ref<{counts:{type:string;count:number}[];photos:number;storageBytes:number;
  portfolio:{currency:string;valuedItems:number;low:number;high:number}}|null>(null)
const usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})
type Turnstile = { render: (query:string,options:Record<string,unknown>)=>string;reset:()=>void }
function widget() {
  if (!turnstileKey.value || user.value) return
  const script = document.createElement('script')
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async=true
  script.onload=()=> (window as Window & {turnstile?:Turnstile}).turnstile?.render('#challenge',{
    sitekey:turnstileKey.value,action:'login',callback:(token:string)=>challenge.value=token,
    'expired-callback':()=>challenge.value=''
  })
  document.head.appendChild(script)
}
function go(to:Page) {
  page.value=to
  history.replaceState(null,'','/app#'+to.toLowerCase())
  if (to==='Overview') void overview()
}
function search(q:string) { marketQuery.value=q; go('Marketplace') }
async function overview() {
  try { stats.value=await request('/items/statistics') } catch { stats.value=null }
}
async function account() {
  user.value=await request<{email:string;id:string}>('/me').catch(()=>null)
  if (user.value) {
    const connect = sessionStorage.getItem('numis-oauth')
    if (connect?.startsWith('/oauth/authorize?')) {
      sessionStorage.removeItem('numis-oauth')
      location.assign(connect)
    }
    void overview()
  }
}
async function signIn() {
  busy.value=true; error.value=''; status.value=''; developmentLink.value=''
  try {
    const result = await request<{developmentLink?:string}>('/auth/request','POST',{email:email.value,challenge:challenge.value || undefined})
    status.value='Check your email for the sign-in link.'
    developmentLink.value=result.developmentLink ?? ''
  } catch (e) { error.value=message(e) }
  finally {
    busy.value=false
    ;(window as Window & {turnstile?:Turnstile}).turnstile?.reset()
    challenge.value=''
  }
}
async function verifyLink() {
  if (location.hash.startsWith('#signin=')) {
    const token = location.hash.slice(8)
    history.replaceState(null,'','/app')
    try { await request('/auth/verify','POST',{token}) } catch(e) { error.value=message(e) }
  }
}
async function hashChanged() {
  if (location.hash.startsWith('#signin=')) {
    await verifyLink()
    await account()
  } else page.value=readPage()
}
onMounted(async()=>{
  if (onLanding) return
  window.addEventListener('hashchange',hashChanged)
  const connect = new URLSearchParams(location.search).get('connect')
  if (connect?.startsWith('/oauth/authorize?')) sessionStorage.setItem('numis-oauth',connect)
  await verifyLink()
  await account()
  checking.value=false
  if (!user.value) {
    try { turnstileKey.value=(await request<{turnstile:string|null}>('/auth/config')).turnstile }
    catch(e){error.value=message(e)}
    widget()
  }
})
onUnmounted(()=>window.removeEventListener('hashchange',hashChanged))
</script>

<template>
  <Landing v-if="onLanding"/>
  <div v-else-if="checking" class="signin"><p role="status">Opening your catalog…</p></div>
  <div v-else-if="!user" class="signin">
    <a class="brand" href="/"><img src="/mark.svg" alt="" width="42" height="42">Numis<span>Vault</span></a>
    <main class="panel">
      <p class="eyebrow">PRIVATE CATALOG</p><h1>Open your ledger.</h1>
      <p>Enter your email to create an account or sign in.</p>
      <form @submit.prevent="signIn">
        <label>Email address<input v-model="email" required type="email" autocomplete="email" placeholder="collector@example.com"></label>
        <div id="challenge"></div>
        <button class="primary" :disabled="busy || (!!turnstileKey && !challenge)">Send sign-in link</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="status" role="status">{{ status }}</p>
      <a v-if="developmentLink" :href="developmentLink">Open local sign-in link</a>
    </main>
  </div>
  <div v-else class="workspace">
    <aside class="workspace-nav">
      <a class="brand" href="/"><img src="/mark.svg" alt="" width="36" height="36">Numis<span>Vault</span></a>
      <nav aria-label="Catalog"><button v-for="route in routes" :key="route" :aria-current="route===page ? 'page':undefined" @click="go(route)">{{ route }}</button></nav>
    </aside>
    <main class="workspace-main" :key="page">
      <template v-if="page==='Overview'">
        <p class="eyebrow">PRIVATE CATALOG</p><h1>Your ledger</h1>
        <div class="metrics" v-if="stats"><div v-for="type in ['coin','banknote']" :key="type"><span>{{type==='coin'?'Coins':'Banknotes'}}</span><strong>{{stats.counts.find(s=>s.type===type)?.count ?? 0}}</strong></div><div><span>Photos</span><strong>{{stats.photos}}</strong></div></div>
        <section class="panel" v-if="stats?.portfolio.valuedItems"><h2>Estimated portfolio value</h2>
          <p class="value">{{usd.format(stats.portfolio.low)}} – {{usd.format(stats.portfolio.high)}}</p>
          <p>{{stats.portfolio.valuedItems}} of {{stats.counts.reduce((sum,row)=>sum+row.count,0)}} specimens have sufficient USD evidence.</p>
        </section>
        <section class="panel"><h2>Catalog your next batch</h2><p>Choose photographs or take them in succession. Review candidate identifications before saving specimens.</p><button class="primary" @click="go('Imports')">Import photos</button></section>
      </template>
      <Catalog v-else-if="page==='Collection'"/>
      <ImportView v-else-if="page==='Imports'"/>
      <GoalsMarket v-else-if="page==='Themes' || page==='Marketplace'" :mode="page" :initial-query="marketQuery" @search="search"/>
      <Settings v-else :email="user.email"/>
    </main>
  </div>
</template>
