<script setup lang="ts">
import { ref, watch } from 'vue'
import { message, request } from './api'
import type { Specimen } from './api'
const props = defineProps<{specimen:Specimen;currency:string}>()
type Guide = {status:string;typeID?:number;issueID?:number;source?:string;currency:string;
  candidates?:{id:number;label:string}[];issues?:{id:number;label:string}[];prices?:{grade:string;price:number}[]}
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
let sequence=0
watch(()=>[props.specimen,props.currency],()=>{type.value='';guide.value=undefined;void lookup()}, {immediate:true})
async function lookup(mode: 'auto'|'types'|'chooseType'|'chooseIssue' = 'auto', chosenType?:number) {
  const generation=++sequence
  working.value=true;error.value=''
  if(mode!=='chooseIssue'){issues.value=[];issue.value=''}
  const endpoint='/valuations/'+props.specimen.id+'/guide'
  const params=new URLSearchParams({currency:props.currency})
  if(type.value) params.set('type',type.value)
  if(mode==='auto') params.set('auto','1')
  try {
    let result:Guide
    if(mode==='chooseType' || mode==='chooseIssue') {
      result=await request<Guide>(endpoint,'POST',{type:chosenType ?? resolvedType.value,
        issue:mode==='chooseIssue' ? Number(issue.value) : undefined,currency:props.currency})
    } else {
      result=await request<Guide>(endpoint+'?'+params)
    }
    if(generation!==sequence)return
    guide.value=result
    resolvedType.value=result.typeID
    if(result.issues) issues.value=result.issues
    if(result.issueID) issue.value=String(result.issueID)
  } catch(e){if(generation===sequence){error.value=message(e);guide.value=undefined}}
  finally{if(generation===sequence)working.value=false}
}
</script>
<template>
  <section aria-label="Numista price guide by grade">
    <h3>Numista price guide by grade</h3>
    <p v-if="working" role="status">Checking Numista…</p><p v-if="error" role="alert">{{error}}</p>
    <template v-if="guide"><p v-if="status[guide.status]" role="status">{{status[guide.status]}}</p>
      <table v-if="guide.prices?.length"><caption>Numista guide · Issue {{guide.issueID}} · {{guide.currency}}</caption><thead><tr><th>Grade</th><th>Estimated value</th></tr></thead><tbody><tr v-for="row in guide.prices" :key="row.grade"><th>{{row.grade.toUpperCase()}}</th><td>{{new Intl.NumberFormat(undefined,{style:'currency',currency:guide.currency}).format(row.price)}}</td></tr></tbody></table>
      <a v-if="guide.source" :href="guide.source" target="_blank" rel="noopener noreferrer">Numista N# {{guide.typeID}} ↗</a>
    </template>
    <label v-if="issues.length && (!guide?.issueID || guide?.status==='choose_issue')">Choose the issue for this specimen
      <select v-model="issue" :disabled="working" @change="lookup('chooseIssue')"><option value="" disabled>Year, mint or variety</option><option v-for="row in issues" :key="row.id" :value="String(row.id)">{{row.label}}</option></select>
    </label>
    <div v-if="guide?.candidates?.length"><p>Which catalog type matches your specimen?</p>
      <button v-for="row in guide.candidates" :key="row.id" :disabled="working" @click="lookup('chooseType',row.id)">{{row.label}} · N# {{row.id}}</button>
    </div>
    <details><summary>Set or change the catalog match</summary>
      <form class="inline" @submit.prevent="lookup('types')"><label>Numista N#<input v-model.trim="type" placeholder="Use saved reference" inputmode="numeric" required pattern="[1-9][0-9]*"></label><button :disabled="working">Find issues</button></form>
    </details>
    <button v-if="error || guide?.status==='unavailable' || guide?.status==='rate_limited'" :disabled="working" @click="lookup()">Retry price guide</button>
  </section>
</template>
