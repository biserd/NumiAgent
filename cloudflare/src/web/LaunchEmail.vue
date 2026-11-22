<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { message, request } from './api'
import SiteNav from './SiteNav.vue'
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
    status.value=response.status==='confirmed' ? 'Confirmed. We’ll email you when NumiAgent launches.' : 'You’re off the NumiAgent launch list.'
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
          <p>{{action==='confirm'?'Confirm you want to hear when the app is available.':'Remove this address from the launch list.'}}</p>
          <button class="primary" :disabled="busy" @click="submit">{{action==='confirm'?'Confirm launch email':'Unsubscribe'}}</button>
          <p v-if="error" role="alert" class="error">{{error}}</p>
        </template>
        <p v-else>Use the link in your launch email to manage your signup.</p>
        <p><a href="/#launch">Return to NumiAgent</a></p>
      </section>
    </main>
  </div>
</template>
