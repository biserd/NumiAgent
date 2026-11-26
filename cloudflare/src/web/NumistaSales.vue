<script setup lang="ts">
import { ref, watch } from 'vue'
import { message, request } from './api'
import type { Specimen } from './api'

const props=defineProps<{specimen:Specimen}>()
type Lot={url:string;house:string;auction:string;date:string;lot:string;grade?:string;amount:number;currency:string;basis:string}
type Sales={status:string;message?:string;typeID?:number;issueID?:number;source?:string;results?:Lot[];nextPage?:number}
const sales=ref<Sales>()
const page=ref(1)
const loading=ref(false)
const error=ref('')
let sequence=0
async function lookup(target:number) {
  const current=++sequence
  loading.value=true;error.value=''
  try {
    const value=await request<Sales>('/valuations/'+props.specimen.id+'/numista-sales?page='+target)
    if(current===sequence){sales.value=value;page.value=target}
  } catch(e){if(current===sequence)error.value=message(e)}
  finally {if(current===sequence)loading.value=false}
}
watch(()=>props.specimen,()=>{sales.value=undefined;page.value=1;void lookup(1)},{immediate:true})
</script>
<template>
  <section aria-label="Numista auction sales" :aria-busy="loading">
    <h3>Numista auction sales</h3>
    <a v-if="sales?.source" :href="sales.source" target="_blank" rel="noopener noreferrer">Numista N# {{sales.typeID}}<template v-if="sales.issueID"> · Issue {{sales.issueID}}</template> ↗</a>
    <p v-if="loading" role="status">Looking up completed auctions…</p>
    <p v-if="error" role="alert">{{error}}</p><p v-else-if="sales?.message" role="status">{{sales.message}}</p>
    <ul v-if="sales?.results?.length" class="record-list">
      <li v-for="lot in sales.results" :key="lot.url">
        <a :href="lot.url" target="_blank" rel="noopener noreferrer">{{lot.house}} · {{lot.auction}} · Lot {{lot.lot}} ↗</a>
        <span>{{lot.date}}<template v-if="lot.grade"> · {{lot.grade}}</template></span>
        <span>{{new Intl.NumberFormat(undefined,{style:'currency',currency:lot.currency,currencyDisplay:'code'}).format(lot.amount)}} · {{lot.basis==='hammer'?'Hammer price':lot.basis==='with_premium'?'Includes buyer’s premium':'Premium unspecified'}}</span>
      </li>
    </ul>
    <button v-if="page>1" :disabled="loading" @click="lookup(page-1)">Previous sales</button>
    <button v-if="sales?.nextPage" :disabled="loading" @click="lookup(sales.nextPage)">Next sales</button>
    <button v-if="error || sales?.status==='unavailable' || sales?.status==='rate_limited' || sales?.status==='issue_required'" :disabled="loading" @click="lookup(page)">Check again</button>
  </section>
</template>
