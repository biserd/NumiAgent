<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message, request } from './api'
const props=defineProps<{mode:'Themes'|'Marketplace';initialQuery:string}>()
const emit=defineEmits<{search:[query:string]}>()
type Rule = {label:string;ruler:string;issuer:string;type?:string;reference:string;metal:string;year:string;denomination:string;source?:string;aliases:string[]}
type Slot=Rule & {owned:{id:string;title:string}[]}
type Theme={id:string;name:string;owned:number;slots:Slot[];missing:Slot[];percent:number}
type Listing={url:string;title:string;description?:string;state:string;closesAt?:string;verifiedAt?:string;price?:{kind:string;amount:number;currency:string;premium?:number}}
const shells=ref<{id:string;name:string}[]>([])
const active=ref<Theme|null>(null)
const goal=ref('')
const name=ref('')
const editing=ref(false)
const rules=ref<Rule[]>([])
const blank=()=>({label:'',ruler:'',issuer:'',reference:'',metal:'',year:'',denomination:'',aliases:[]})
const query=ref(props.initialQuery)
const seen=ref<{status:string;retrievedAt:string;results:Listing[];coverage:{domains:string[];status:string;provider:string}[]}|null>(null)
const watches=ref<{id:string;query:string;alert:number;checked:number|null}[]>([])
const alert=ref(false)
const error=ref('')
const note=ref('')
const busy=ref(false)
const ruleFields=[['label','Slot label'],['ruler','Ruler'],['issuer','Issuer'],['reference','Catalog reference'],['metal','Metal'],['denomination','Denomination'],['year','Year or range']] as const
async function action(fn:()=>Promise<void>){
  error.value='';note.value='';busy.value=true
  try{await fn()}catch(e){error.value=message(e)}
  finally{busy.value=false}
}
async function load(){shells.value=await request('/themes')}
async function open(id:string){active.value=await request('/themes/'+id);editing.value=false}
async function preview(){
  const value=await request<{name:string;slots:Rule[];status:string}>('/themes/preview','POST',{goal:goal.value})
  active.value=null;name.value=value.name;rules.value=value.slots.length ? value.slots:[blank()];editing.value=true
  if(value.status==='manual_required') note.value='Add the matching rules for this goal.'
}
function create(){
  active.value=null;name.value='';rules.value=[blank()];editing.value=true
}
function edit(){
  if(!active.value)return
  name.value=active.value.name;rules.value=active.value.slots.map(({owned:_owned,...rule})=>({...rule}));editing.value=true
}
async function save(){
  const payload={name:name.value,slots:rules.value.map(rule=>({...rule,source:rule.source || undefined,type:rule.type || undefined}))}
  const id=active.value?.id
  if(id) {await request('/themes/'+id,'PUT',payload);await open(id)}
  else {const created=await request<{id:string}>('/themes','POST',payload);await open(created.id)}
  await load()
}
async function remove(){
  if(!active.value || !confirm('Delete this theme?'))return
  await request('/themes/'+active.value.id,'DELETE')
  active.value=null;await load()
}
async function search(){
  seen.value=await request('/market/search?q='+encodeURIComponent(query.value))
}
async function loadWatches(){watches.value=await request('/watchlists')}
async function watch(){
  await request('/watchlists','POST',{query:query.value,alert:alert.value})
  note.value='Search saved.';await loadWatches()
}
onMounted(()=>action(async()=>{
  if(props.mode==='Themes') await load()
  else {await loadWatches();if(query.value) await search()}
}))
</script>
<template>
  <template v-if="mode==='Themes'">
    <div class="section-heading"><div><h1>Collection themes</h1><p>Choose the pieces you’re collecting and track the gaps.</p></div><button @click="create">Create manually</button></div>
    <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="note" role="status">{{note}}</p>
    <form class="panel inline" @submit.prevent="action(preview)">
      <label>Describe your goal<input required maxlength="400" v-model="goal" placeholder="A silver coin from each first-century Roman emperor"></label>
      <button class="primary" :disabled="busy">Preview checklist</button>
    </form>
    <div class="actions"><button v-for="theme in shells" :key="theme.id" @click="action(()=>open(theme.id))">{{theme.name}}</button></div>
    <form v-if="editing" class="panel" @submit.prevent="action(save)">
      <h2>Checklist rules</h2><label>Theme name<input v-model="name" required maxlength="100"></label>
      <fieldset v-for="(rule,index) in rules" :key="index"><legend>Slot {{index+1}}</legend>
        <div class="form-grid"><label v-for="[key,label] in ruleFields" :key="key">{{label}}<input v-model="rule[key]" :required="key==='label'"></label>
          <label>Type<select v-model="rule.type"><option :value="undefined">Any</option><option value="coin">Coin</option><option value="banknote">Banknote</option></select></label>
          <label>Source URL<input v-model="rule.source" type="url"></label></div>
        <button type="button" @click="rules.splice(index,1)" :disabled="rules.length<2">Remove slot</button>
      </fieldset>
      <div class="actions"><button type="button" @click="rules.push(blank())" :disabled="rules.length>=100">Add a slot</button><button class="primary" :disabled="busy">Save theme</button><button type="button" @click="editing=false">Cancel editing</button></div>
    </form>
    <section v-else-if="active" class="panel">
      <div class="section-heading"><div><h2>{{active.name}}</h2><p>{{active.owned}} of {{active.slots.length}} slots filled · {{active.percent}}%</p></div><div class="actions"><button @click="edit">Edit theme</button><button @click="action(remove)">Delete theme</button></div></div>
      <progress :value="active.owned" :max="active.slots.length" aria-label="Theme progress"></progress>
      <ul class="record-list">
        <li v-for="(slot,index) in [...active.missing,...active.slots.filter(s=>s.owned.length)]" :key="index">
          <strong>{{slot.label}}</strong>
          <span>{{slot.owned.length ? slot.owned.map(item=>item.title).join(', ') :'Missing'}}</span>
          <small v-if="slot.owned.length>1">{{slot.owned.length}} specimens match this slot</small>
          <a v-if="slot.source" :href="slot.source" target="_blank" rel="noopener noreferrer">Reference ↗</a>
          <button v-if="!slot.owned.length" @click="emit('search',[slot.ruler || slot.label,slot.reference,slot.denomination,slot.metal].filter(Boolean).join(' ').slice(0,180))">Search auctions</button>
        </li>
      </ul>
    </section>
  </template>
  <template v-else>
    <h1>Marketplace</h1><p>Search approved sources for a type, ruler, or catalog reference.</p>
    <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="note" role="status">{{note}}</p>
    <section class="panel">
      <form class="inline" @submit.prevent="action(search)"><label>Auction search<input v-model.trim="query" type="search" required minlength="2" maxlength="180" placeholder="e.g. Trajan silver denarius"></label><button class="primary" :disabled="busy">{{busy?'Searching…':'Search auctions'}}</button></form>
      <div class="actions"><button :disabled="query.length<2 || busy" @click="action(watch)">Save search</button><label class="check"><input v-model="alert" type="checkbox">Email me when an approved feed reports a new active lot</label></div>
    </section>
    <section v-if="seen" class="panel">
      <h2>Search results</h2>
      <p v-if="seen.status==='unavailable'" role="status">Marketplace coverage is unavailable.</p>
      <p v-else-if="seen.status==='insufficient_verified_coverage'" role="status">No active lots verified by the queried sources. Check any discovery links with the seller.</p>
      <p>Retrieved {{new Date(seen.retrievedAt).toLocaleString()}}</p>
      <small v-for="provider in seen.coverage" :key="provider.provider">{{provider.provider}} · {{provider.status}} · {{provider.domains.join(', ')}}<br></small>
      <ul class="record-list"><li v-for="entry in seen.results" :key="entry.url">
        <a :href="entry.url" target="_blank" rel="noopener noreferrer">{{entry.title}} ↗</a><span>{{entry.state==='unknown'?'Status unverified':entry.state}}</span>
        <small v-if="entry.closesAt">Closes {{new Date(entry.closesAt).toLocaleString()}}</small>
        <small v-if="entry.verifiedAt">Verified {{new Date(entry.verifiedAt).toLocaleString()}}</small>
        <small v-if="entry.price">{{entry.price.kind.replace('_',' ')}} · {{entry.price.currency}} {{entry.price.amount}}{{entry.price.premium==null?'':' + '+entry.price.premium+'% premium'}}</small>
        <p v-if="entry.description">{{entry.description}}</p>
      </li></ul>
    </section>
    <section class="panel"><h2>Saved searches</h2>
      <p v-if="!watches.length">No saved searches yet.</p>
      <ul class="record-list"><li v-for="w in watches" :key="w.id"><strong>{{w.query}}</strong>
        <small>{{w.alert?'Email alerts enabled':'Search only'}}{{w.checked?' · Checked '+new Date(w.checked*1000).toLocaleString():''}}</small>
        <div class="actions"><button @click="query=w.query;action(search)">Run search</button><button @click="action(async()=>{await request('/watchlists/'+w.id,'DELETE');await loadWatches()})">Remove search</button></div>
      </li></ul>
    </section>
  </template>
</template>
