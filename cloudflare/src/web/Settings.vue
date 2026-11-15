<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message, request } from './api'
import Cost from './Cost.vue'
defineProps<{email:string}>()
type Session={id:string;created:number;expires:number;current:number}
const sessions=ref<Session[]>([])
const usage=ref<{resetsAt:string;meters:{action:string;used:number;limit:number}[]}|null>(null)
const labels:Record<string,string>={upload_requests:'Upload requests',ai:'Vision requests',market:'Marketplace searches'}
const error=ref('')
const confirmation=ref('')
const stamp=(value:number)=>new Date(value*1000).toLocaleString()
async function action(fn:()=>Promise<void>){try {error.value='';await fn()}catch(e){error.value=message(e)}}
async function load(){
  const [active,meters]=await Promise.all([request<Session[]>('/me/sessions'),request<typeof usage.value>('/me/usage')])
  sessions.value=active
  usage.value=meters
}
onMounted(()=>action(load))
async function logout(){await request('/me/signout','POST');location.assign('/app')}
async function revoke(s:Session){await request('/me/sessions/'+s.id,'DELETE');if(s.current)location.assign('/app');else await load()}
async function remove(){await request('/me','DELETE',{confirm:confirmation.value});location.assign('/')}
</script>
<template>
  <h1>Settings</h1><p v-if="error" class="error" role="alert">{{error}}</p>
  <section class="panel"><h2>Account</h2><p>Signed in as {{email}}</p><button @click="action(logout)">Sign out</button></section>
  <section class="panel"><h2>Active sessions</h2><ul class="record-list">
    <li v-for="s in sessions" :key="s.id"><strong>{{s.current?'This session':'Other session'}}</strong><small>Started {{stamp(s.created)}} · Expires {{stamp(s.expires)}}</small><button @click="action(()=>revoke(s))">Revoke session</button></li>
  </ul></section>
  <section class="panel"><h2>Developer access</h2><p>Create and revoke REST API keys and manage MCP connections.</p>
    <a href="/app#developer">Open developer access</a>
  </section>
  <section class="panel"><h2>Privacy and export</h2><p>Download your account records. Open individual photographs in the catalog to save copies.</p>
    <a href="/api/v1/me/export" download>Export account JSON</a> · <a href="/api/v1/items/export.csv" download>Export collection CSV</a>
    <details><summary>Delete account</summary><form @submit.prevent="action(remove)">
      <p>Deletion revokes access immediately and schedules removal of the catalog and private photographs.</p>
      <label>Type DELETE to confirm<input v-model="confirmation" autocomplete="off"></label>
      <button :disabled="confirmation!=='DELETE'">Delete my account</button>
    </form></details>
  </section>
  <section v-if="usage" class="panel"><h2>Daily usage</h2>
    <ul class="record-list"><li v-for="meter in usage.meters" :key="meter.action">{{labels[meter.action] || meter.action}} · {{meter.used}} of {{meter.limit}}</li></ul>
    <p>Resets {{new Date(usage.resetsAt).toLocaleString()}}</p>
  </section>
  <Cost/>
</template>
