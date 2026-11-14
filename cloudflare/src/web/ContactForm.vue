<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { request, message } from './api'
import { mountChallenge } from './challenge'
import { contactTopics } from '../shared/contact'
const email=ref('')
const topic=ref<string>('General question')
const text=ref('')
const error=ref('')
const receipt=ref('')
const busy=ref(false)
const ready=ref(false)
const requiresChallenge=ref(false)
const challenge=ref('')
const challengeRoot=ref<HTMLElement|null>(null)
let widget:Awaited<ReturnType<typeof mountChallenge>>=null

onMounted(async()=>{
  try {
    const config=await request<{turnstile:string|null;local:boolean}>('/auth/config')
    requiresChallenge.value=!config.local
    if (requiresChallenge.value) {
      if (!config.turnstile || !challengeRoot.value) throw new Error('Contact is temporarily unavailable.')
      widget=await mountChallenge(challengeRoot.value,config.turnstile,'contact',token=>challenge.value=token)
    }
    ready.value=true
  } catch (e) {error.value=message(e)}
})
onUnmounted(()=>widget?.remove())
async function send() {
  busy.value=true
  error.value=''
  try {
    const response=await request<{reference:string}>('/contact','POST',{
      email:email.value,topic:topic.value,message:text.value,challenge:challenge.value || undefined
    })
    receipt.value=response.reference
    text.value=''
    widget?.remove()
    widget=null
  } catch (e) {
    error.value=message(e)
    widget?.reset()
    challenge.value=''
  } finally {busy.value=false}
}
</script>
<template>
  <section class="panel contact-panel">
    <div v-if="receipt" role="status" class="contact-receipt">
      <h2>Message received</h2>
      <p>Keep this reference if you need to follow up.</p>
      <code>{{receipt}}</code>
    </div>
    <form v-else @submit.prevent="send">
      <div class="form-grid">
        <label>Reply email<input v-model.trim="email" type="email" autocomplete="email" maxlength="250" required></label>
        <label>Topic<select v-model="topic"><option v-for="option in contactTopics" :key="option">{{option}}</option></select></label>
      </div>
      <label>Message<textarea v-model.trim="text" rows="6" minlength="10" maxlength="3000" required></textarea></label>
      <div ref="challengeRoot"></div>
      <p v-if="error" role="alert" class="error">{{error}}</p>
      <button class="primary" :disabled="!ready || busy || (requiresChallenge && !challenge)">Send message</button>
    </form>
  </section>
</template>
