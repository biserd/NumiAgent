<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { developerKeyLifespanDays } from '../shared/developerAccess'
import { message, request } from './api'

type Key = {id:string;label:string;scope:string;created:number;expires:number}
type Grant = {id:string;client_id:string;scopes:string;created:number}
const keys = ref<Key[]>([])
const grants = ref<Grant[]>([])
const label = ref('')
const secret = ref('')
const error = ref('')
const status = ref('')
const busy = ref(false)
const loading = ref(true)
const mcp = location.origin+'/mcp'
const date = (seconds:number) => new Date(seconds*1000).toLocaleDateString()
async function load(){
  const [active,connected] = await Promise.all([
    request<Key[]>('/me/developer-keys'),request<Grant[]>('/me/grants')
  ])
  keys.value=active
  grants.value=connected
  loading.value=false
}
async function action(work:()=>Promise<void>){
  busy.value=true
  error.value=''
  status.value=''
  try {await work()} catch(e){error.value=message(e)} finally {busy.value=false}
}
async function create(){
  const {secret:value,...key}=await request<Key & {secret:string}>('/me/developer-keys','POST',{label:label.value})
  secret.value=value
  label.value=''
  keys.value.unshift(key)
}
async function copy(value:string,success:string){
  await navigator.clipboard.writeText(value)
  status.value=success
}
async function revokeKey(id:string){
  await request('/me/developer-keys/'+id,'DELETE')
  keys.value=keys.value.filter(key=>key.id!==id)
  secret.value=''
  status.value='API key revoked.'
}
async function revokeGrant(id:string){
  await request('/me/grants/'+id,'DELETE')
  grants.value=grants.value.filter(grant=>grant.id!==id)
  status.value='MCP client access revoked.'
}
onMounted(()=>action(load))
</script>

<template>
  <h1>Developer access</h1>
  <p>Create an API key for your own scripts or authorize a remote MCP client for this account.</p>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <p v-if="status" role="status">{{status}}</p>
  <section class="panel">
    <h2>REST API keys</h2>
    <p>Keys can read your private catalog, photographs, valuations and related records. Each key expires after {{developerKeyLifespanDays}} days.</p>
    <p><a href="/developers/api">REST API guide</a> · <a href="/openapi.json">OpenAPI specification</a></p>
    <form @submit.prevent="action(create)">
      <label>Key name <input v-model="label" required maxlength="80" autocomplete="off" placeholder="Inventory sync"></label>
      <button class="primary" :disabled="busy || !label.trim() || !!secret">Create read-only key</button>
    </form>
    <div v-if="secret" class="panel developer-secret">
      <p>Copy this secret now. It can only be viewed here, immediately after creation.</p>
      <label>New API key <input :value="secret" readonly spellcheck="false" autocomplete="off"></label>
      <button :disabled="busy" @click="action(()=>copy(secret,'API key copied.'))">Copy key</button>
      <button type="button" @click="secret=''">Hide key</button>
    </div>
    <p v-if="!loading && !keys.length">No active API keys.</p>
    <ul v-if="keys.length" class="record-list">
      <li v-for="key in keys" :key="key.id">
        <strong>{{key.label}}</strong><small>{{key.scope}} · Expires {{date(key.expires)}}</small>
        <button :disabled="busy" @click="action(()=>revokeKey(key.id))">Revoke key</button>
      </li>
    </ul>
  </section>
  <section class="panel">
    <h2>MCP connections</h2>
    <p>Add this Streamable HTTP endpoint in your MCP client. Sign in and approve access from the client’s authorization flow.</p>
    <label>MCP server URL <input :value="mcp" readonly spellcheck="false"></label>
    <button :disabled="busy" @click="action(()=>copy(mcp,'MCP server URL copied.'))">Copy MCP URL</button>
    <p><a href="/developers/mcp">MCP connection guide and tool reference</a></p>
    <p v-if="!loading && !grants.length">No MCP clients authorized.</p>
    <ul v-if="grants.length" class="record-list">
      <li v-for="grant in grants" :key="grant.id">
        <strong>{{grant.client_id}}</strong><small>{{grant.scopes}} · Authorized {{date(grant.created)}}</small>
        <button :disabled="busy" @click="action(()=>revokeGrant(grant.id))">Revoke client</button>
      </li>
    </ul>
  </section>
</template>
