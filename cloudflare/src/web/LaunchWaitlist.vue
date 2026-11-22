<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { message, request } from './api'
import { mountChallenge } from './challenge'
import { trackMarketing } from './launch'

const email=ref('')
const status=ref('')
const error=ref('')
const ready=ref(false)
const busy=ref(false)
const requiresChallenge=ref(true)
const challenge=ref('')
const challengeRoot=ref<HTMLElement|null>(null)
const confirmation=ref('')
const removal=ref('')
let widget:Awaited<ReturnType<typeof mountChallenge>>=null

async function startChallenge() {
  if (ready.value || busy.value) return
  busy.value=true
  error.value=''
  try {
    const config=await request<{turnstile:string|null;local:boolean}>('/auth/config')
    requiresChallenge.value=!config.local
    if (requiresChallenge.value) {
      if (!config.turnstile || !challengeRoot.value) throw new Error('Launch signup is temporarily unavailable.')
      widget=await mountChallenge(challengeRoot.value,config.turnstile,'launch_waitlist',value=>challenge.value=value)
      if (!widget) return
    }
    ready.value=true
  } catch (e) {error.value=message(e)}
  finally {busy.value=false}
}
onUnmounted(()=>widget?.remove())

async function signup() {
  busy.value=true
  error.value=''
  try {
    const response=await request<{confirmation?:string;removal?:string}>('/launch-waitlist','POST',{
      email:email.value,challenge:challenge.value || undefined
    })
    status.value='Check your inbox to confirm your launch notification.'
    confirmation.value=response.confirmation ?? ''
    removal.value=response.removal ?? ''
    email.value=''
    trackMarketing('launch_signup')
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
  <section id="launch" class="wrap launch-signup" aria-labelledby="launch-heading">
    <div>
      <h2 id="launch-heading">Get the iPhone and iPad launch email</h2>
      <p>We’ll send one email when NumiAgent is available on the App Store. Confirm your address from your inbox.</p>
      <a href="/privacy#launch-email" class="text-link">How we use your email</a>
    </div>
    <div v-if="status">
      <p role="status">{{status}}</p>
      <p v-if="confirmation"><a :href="confirmation">Open local confirmation link</a></p>
      <p v-if="removal"><a :href="removal">Open local unsubscribe link</a></p>
    </div>
    <form v-else @submit.prevent="signup">
      <label>Email address<input v-model.trim="email" type="email" autocomplete="email" maxlength="250" required @focus="startChallenge" @input="startChallenge"></label>
      <div ref="challengeRoot"></div>
      <button class="primary" :disabled="!ready || busy || (requiresChallenge && !challenge)">Notify me</button>
      <p v-if="error" role="alert" class="error">{{error}}</p>
    </form>
  </section>
</template>
