<script setup lang="ts">
import { ref, watch } from 'vue'
import { message, request } from './api'
const props = defineProps<{id:string;currency:string}>()
type Guide = {status:string;typeID?:number;issueID?:number;source?:string;currency:string;
  issues?:{id:number;label:string}[];prices?:{grade:string;price:number}[]}
const guide = ref<Guide>()
const issues = ref<NonNullable<Guide['issues']>>([])
const type = ref('')
const resolvedType = ref<number>()
const issue = ref('')
const working = ref(false)
const error = ref('')
const status: Record<string,string> = {
  provider_not_configured:'The Numista price guide is currently unavailable.',
  reference_required:'Enter the N# from the Numista catalog to find this issue.',
  no_issues:'Numista has no issues listed for this type.',no_prices:'Numista has no grade estimates for this issue.',
  not_found:'Numista could not find this type or issue.',rate_limited:'The guide has reached its request limit. Try again later.',
  unavailable:'Numista could not return a price guide. Try again later.'
}
watch(()=>props.currency,()=>{guide.value=undefined;issues.value=[];issue.value=''})
async function lookup(forIssue=false) {
  const currency=props.currency
  if(!forIssue){issues.value=[];issue.value=''}
  working.value=true;error.value=''
  const params=new URLSearchParams({currency})
  const id=forIssue ? String(resolvedType.value ?? '') : type.value
  if(id) params.set('type',id)
  if(forIssue) params.set('issue',issue.value)
  guide.value=undefined
  try {
    const result=await request<Guide>('/valuations/'+props.id+'/guide?'+params)
    if(currency!==props.currency)return
    guide.value=result
    if(result.issues){issues.value=result.issues;resolvedType.value=result.typeID}
  } catch(e){error.value=message(e)}
  finally{working.value=false}
}
</script>
<template>
  <details><summary>Numista price guide by grade</summary>
    <p>Choose the year and mint that match your piece. Guide prices are indicative values for that issue.</p>
    <form class="inline" @submit.prevent="lookup()"><label>Numista N#<input v-model.trim="type" placeholder="Use saved reference" inputmode="numeric" pattern="[1-9][0-9]*"></label><button :disabled="working">Find issues</button></form>
    <form v-if="issues.length" class="inline" @submit.prevent="lookup(true)"><label>Issue<select v-model="issue" required><option value="" disabled>Choose year, mint or variety</option><option v-for="row in issues" :key="row.id" :value="String(row.id)">{{row.label}}</option></select></label><button :disabled="working || !issue">Get grade prices</button></form>
    <p v-if="working" role="status">Looking up the guide…</p><p v-if="error" role="alert">{{error}}</p>
    <template v-if="guide"><p v-if="status[guide.status]" role="status">{{status[guide.status]}}</p>
      <table v-if="guide.prices?.length"><caption>Numista guide · Issue {{guide.issueID}} · {{guide.currency}}</caption><thead><tr><th>Grade</th><th>Estimated value</th></tr></thead><tbody><tr v-for="row in guide.prices" :key="row.grade"><th>{{row.grade.toUpperCase()}}</th><td>{{new Intl.NumberFormat(undefined,{style:'currency',currency:guide.currency}).format(row.price)}}</td></tr></tbody></table>
      <a v-if="guide.source" :href="guide.source" target="_blank" rel="noopener noreferrer">Numista N# {{guide.typeID}} ↗</a>
    </template>
  </details>
</template>
