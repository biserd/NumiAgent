<script setup lang="ts">
import { onMounted, ref } from 'vue'

const storageKey='numiagent.analytics'
type Choice='allow'|'decline'
type AnalyticsWindow={dataLayer?:unknown[];gtag?:(...args:unknown[])=>void;[key: `ga-disable-${string}`]:boolean|undefined}
const measurementId=ref('')
const open=ref(false)

function start(id:string) {
  const target=window as unknown as AnalyticsWindow
  target[`ga-disable-${id}`]=false
  if (target.gtag) {
    target.gtag('consent','update',{analytics_storage:'granted'})
    return
  }
  const dataLayer=target.dataLayer ??= []
  target.gtag=function(){ dataLayer.push(arguments) }
  target.gtag('consent','default',{
    analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'
  })
  target.gtag('js',new Date())
  target.gtag('config',id,{
    page_location:location.origin+location.pathname,
    page_referrer:document.referrer ? new URL(document.referrer).origin : '',
    allow_google_signals:false,allow_ad_personalization_signals:false
  })
  const script=document.createElement('script')
  script.async=true
  script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id)
  document.head.appendChild(script)
}

function choose(choice:Choice) {
  try { localStorage.setItem(storageKey,choice) } catch { /* A blocked storage API still allows a choice for this page. */ }
  open.value=false
  if (choice==='allow') start(measurementId.value)
  else {
    const target=window as unknown as AnalyticsWindow
    target[`ga-disable-${measurementId.value}`]=true
    target.gtag?.('consent','update',{analytics_storage:'denied'})
    for(const cookie of document.cookie.split(';')) {
      const name=cookie.split('=')[0]?.trim()
      if (name==='_ga' || name?.startsWith('_ga_')) {
        document.cookie=name+'=; Max-Age=0; Path=/; Secure'
        document.cookie=name+'=; Max-Age=0; Path=/; Domain='+location.hostname+'; Secure'
      }
    }
  }
}

onMounted(()=>{
  const id=document.querySelector<HTMLMetaElement>('meta[name="numiagent-ga4"]')?.content
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return
  measurementId.value=id
  let saved:string|null=null
  try { saved=localStorage.getItem(storageKey) } catch { /* Without storage ask again on the next page. */ }
  if (saved==='allow') start(id)
  else open.value=saved!=='decline'
})
</script>

<template>
  <button v-if="measurementId" type="button" class="analytics-preferences" :aria-expanded="open"
    @click="open=!open">Analytics preferences</button>
  <section v-if="open" class="analytics-choice" aria-label="Website analytics">
    <p>Allow Google Analytics to count visits to public pages?</p>
    <div class="analytics-actions">
      <button type="button" @click="choose('decline')">Decline</button>
      <button type="button" class="primary" @click="choose('allow')">Allow analytics</button>
    </div>
  </section>
</template>

<style scoped>
.analytics-preferences { padding:0; border:0; background:none; color:inherit; text-decoration:underline; min-height:2rem }
.analytics-choice { position:fixed; z-index:20; bottom:1rem; right:1rem; width:min(22rem,calc(100vw - 2rem));
  padding:1rem; background:#f9f5e9; color:#191713; border:1px solid #c6bda9; border-radius:.75rem;
  box-shadow:0 6px 24px #19171326 }
.analytics-choice p { margin:0 0 .75rem }
.analytics-actions { display:flex; flex-wrap:wrap; gap:.5rem }
</style>
