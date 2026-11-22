<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { message, request } from './api'
import SiteNav from './SiteNav.vue'
import { appStoreUrl } from './launch'
const props=defineProps<{appStoreAvailable:boolean}>()
const action=ref<'confirm'|'unsubscribe'>()
let token=''
const busy=ref(false)
const status=ref('')
const error=ref('')
const readEmailLink=()=>{
  const match=/^#(confirm|unsubscribe)=([a-f0-9]{64})$/.exec(location.hash)
  if (match) {
    token=match[2]
    action.value=match[1]==='confirm' ? 'confirm' : 'unsubscribe'
    status.value=''
    error.value=''
  }
  history.replaceState(null,'',location.pathname)
}
onMounted(()=>{
  readEmailLink()
  window.addEventListener('hashchange',readEmailLink)
})
onUnmounted(()=>window.removeEventListener('hashchange',readEmailLink))
async function submit() {
  if (!action.value) return
  busy.value=true
  error.value=''
  try {
    const response=await request<{status:string}>('/launch-waitlist/manage','POST',{token,action:action.value})
    const confirmation=props.appStoreAvailable ? 'Confirmed. NumiAgent is available on the App Store.' : 'Confirmed. We’ll email you when NumiAgent launches.'
    status.value=response.status==='confirmed' ? confirmation : 'You’re off the NumiAgent launch list.'
    token=''
  } catch (e) {error.value=message(e)}
  finally {busy.value=false}
}
</script>
<template>
  <div class="public-page">
    <SiteNav/>
    <main class="information">
      <section class="information-header wrap">
        <h1>NumiAgent launch email</h1>
        <p v-if="status" role="status">{{status}}</p>
        <template v-else-if="action">
          <p>{{action==='unsubscribe'?'Remove this address from the launch list.':appStoreAvailable?'Confirm your email for the launch announcement.':'Confirm you want to hear when the app is available.'}}</p>
          <button class="primary" :disabled="busy" @click="submit">{{action==='confirm'?'Confirm launch email':'Unsubscribe'}}</button>
          <p v-if="error" role="alert" class="error">{{error}}</p>
        </template>
        <p v-else>Use the link in your launch email to manage your signup.</p>
        <p v-if="appStoreAvailable"><a :href="appStoreUrl">Download NumiAgent on the App Store</a></p>
        <p><a :href="appStoreAvailable?'/':'/#launch'">Return to NumiAgent</a></p>
      </section>
    </main>
  </div>
</template>
