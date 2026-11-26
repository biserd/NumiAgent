<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import Catalog from './Catalog.vue'
import ImportView from './ImportView.vue'
import GoalsMarket from './GoalsMarket.vue'
import Settings from './Settings.vue'
import Developer from './Developer.vue'
import Overview from './Overview.vue'
import { siteLinks } from './sitePages'
import { mountChallenge } from './challenge'
import { message, request } from './api'
const path=location.pathname.replace(/\/$/,'') || '/'
const onApp=path==='/app'
const routes = ['Overview','Collection','Imports','Themes','Marketplace','Developer','Settings'] as const
type Page = typeof routes[number]
const readPage = ():Page => routes.find(r=>r.toLowerCase()===location.hash.slice(1)) ?? 'Overview'
const page = ref<Page>(readPage())
const user = ref<{email:string;id:string}|null>(null)
const email = ref('')
const error = ref('')
const status = ref('')
const marketQuery = ref('')
const busy = ref(false)
const checking = ref(onApp)
const startWithNew = ref(false)
const openedSpecimen = ref<string>()
const developmentLink = ref('')
const signInReady=ref(false)
const challengeRequired=ref(true)
const challenge = ref('')
const challengeRoot=ref<HTMLElement|null>(null)
let widget:Awaited<ReturnType<typeof mountChallenge>>=null
function go(to:Page,add=false) {
  startWithNew.value=add
  openedSpecimen.value=undefined
  page.value=to
  history.replaceState(null,'','/app#'+to.toLowerCase())
}
function viewSpecimen(id:string) {
  go('Collection')
  openedSpecimen.value=id
}
function search(q:string) { marketQuery.value=q; go('Marketplace') }
async function account() {
  user.value=await request<{email:string;id:string}>('/me').catch(()=>null)
  if (user.value) {
    const connect = sessionStorage.getItem('numis-oauth')
    if (connect?.startsWith('/oauth/authorize?')) {
      sessionStorage.removeItem('numis-oauth')
      location.assign(connect)
    }
  }
}
async function signIn() {
  busy.value=true; error.value=''; status.value=''; developmentLink.value=''
  try {
    const result = await request<{developmentLink?:string}>('/auth/request','POST',{email:email.value,challenge:challenge.value || undefined})
    if (page.value==='Developer') sessionStorage.setItem('numiagent-after-signin','developer')
    else sessionStorage.removeItem('numiagent-after-signin')
    status.value='Check your email for the sign-in link.'
    developmentLink.value=result.developmentLink ?? ''
  } catch (e) { error.value=message(e) }
  finally {
    busy.value=false
    widget?.reset()
    challenge.value=''
  }
}
async function verifyLink() {
  if (location.hash.startsWith('#signin=')) {
    const token = location.hash.slice(8)
    history.replaceState(null,'','/app')
    try {
      await request('/auth/verify','POST',{token})
      if (sessionStorage.getItem('numiagent-after-signin')==='developer') {
        sessionStorage.removeItem('numiagent-after-signin')
        go('Developer')
      }
    } catch(e) { error.value=message(e) }
  }
}
async function hashChanged() {
  if (location.hash.startsWith('#signin=')) {
    await verifyLink()
    await account()
    if(user.value) {
      widget?.remove()
      widget=null
    }
  } else page.value=readPage()
}
onMounted(async()=>{
  if (!onApp) return
  window.addEventListener('hashchange',hashChanged)
  const connect = new URLSearchParams(location.search).get('connect')
  if (connect?.startsWith('/oauth/authorize?')) sessionStorage.setItem('numis-oauth',connect)
  await verifyLink()
  await account()
  checking.value=false
  if (!user.value) {
    try {
      const config=await request<{turnstile:string|null;local:boolean}>('/auth/config')
      challengeRequired.value=!config.local
      if(challengeRequired.value) {
        await nextTick()
        if(!config.turnstile || !challengeRoot.value) throw new Error('Sign-in is temporarily unavailable.')
        widget=await mountChallenge(challengeRoot.value,config.turnstile,'login',token=>challenge.value=token)
      }
      signInReady.value=true
    } catch(e){error.value=message(e)}
  }
})
onUnmounted(()=>{
  window.removeEventListener('hashchange',hashChanged)
  widget?.remove()
})
</script>

<template>
  <main v-if="!onApp" class="signin">
    <div class="panel"><h1>Page unavailable</h1><a href="/">Return to NumiAgent</a></div>
  </main>
  <div v-else-if="checking" class="signin"><p role="status">Opening your catalog…</p></div>
  <div v-else-if="!user" class="signin">
    <a class="brand" href="/"><img src="/mark.svg" alt="" width="42" height="42">Numi<span>Agent</span></a>
    <main class="panel">
      <h1>Sign in to NumiAgent</h1>
      <p>{{page==='Developer'?'Sign in or create an account to manage your API keys and MCP connections.':'Enter your email to create an account or sign in.'}}</p>
      <form @submit.prevent="signIn">
        <label>Email address<input v-model="email" required type="email" autocomplete="email" placeholder="collector@example.com"></label>
        <div ref="challengeRoot"></div>
        <button class="primary" :disabled="!signInReady || busy || (challengeRequired && !challenge)">Send sign-in link</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="status" role="status">{{ status }}</p>
      <a v-if="developmentLink" :href="developmentLink">Open local sign-in link</a>
    </main>
    <nav class="app-links" aria-label="Site information"><a v-for="link in siteLinks" :key="link.href" :href="link.href">{{link.label}}</a></nav>
  </div>
  <div v-else class="workspace">
    <aside class="workspace-nav">
      <a class="brand" href="/"><img src="/mark.svg" alt="" width="36" height="36">Numi<span>Agent</span></a>
      <nav aria-label="Catalog"><button v-for="route in routes" :key="route" :aria-current="route===page ? 'page':undefined" @click="go(route)">{{ route }}</button></nav>
    </aside>
    <main class="workspace-main">
      <Overview v-if="page==='Overview'" @imports="go('Imports')" @collection="go('Collection',$event)" @specimen="viewSpecimen" @themes="go('Themes')"/>
      <Catalog v-else-if="page==='Collection'" :start-with-new="startWithNew" :opened-specimen="openedSpecimen"/>
      <GoalsMarket v-else-if="page==='Themes' || page==='Marketplace'" :key="page" :mode="page" :initial-query="marketQuery" @search="search"/>
      <Developer v-else-if="page==='Developer'"/>
      <Settings v-else-if="page==='Settings'" :email="user.email"/>
      <KeepAlive><ImportView v-if="page==='Imports'" @specimen="viewSpecimen"/></KeepAlive>
      <nav class="app-links" aria-label="Site information"><a v-for="link in siteLinks" :key="link.href" :href="link.href">{{link.label}}</a></nav>
    </main>
  </div>
</template>
