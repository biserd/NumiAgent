<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message, request, type Specimen } from './api'
import SpecimenTile from './SpecimenTile.vue'

defineEmits<{
  imports:[];
  collection:[create:boolean];
  specimen:[id:string];
  themes:[];
}>()
type Statistics = {
  counts:{type:string;count:number}[];photos:number;
  portfolio:{currency:string;valuedItems:number;low:number;high:number}
}
type BatchSummary = {id:string;label:string;total:number;pending:number;cancelled:number}
const stats=ref<Statistics|null>(null)
const batches=ref<BatchSummary[]>([])
const recent=ref<Specimen[]>([])
const error=ref('')
const total=computed(()=>stats.value?.counts.reduce((sum,row)=>sum+row.count,0) ?? 0)
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})

onMounted(async()=>{
  try {
    const [statistics,imports]=await Promise.all([
      request<Statistics>('/items/statistics'),request<BatchSummary[]>('/imports')
    ])
    stats.value=statistics
    batches.value=imports.slice(0,3)
    if(total.value) recent.value=(await request<{items:Specimen[]}>('/items?sort=recent')).items.slice(0,8)
  } catch (e) {error.value=message(e)}
})
</script>
<template>
  <div class="dashboard-heading">
    <h1>Collection overview</h1>
    <p>Keep your coins, banknotes, photographs, and auction evidence together.</p>
  </div>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <section v-if="recent.length" aria-label="Collection gallery">
    <div class="section-heading"><h2>Recently added</h2><button @click="$emit('collection',false)">View collection</button></div>
    <div class="collection-results grid"><article v-for="piece in recent" :key="piece.id" class="photo-card">
      <SpecimenTile :item="piece" @open="$emit('specimen',piece.id)"/>
    </article></div>
  </section>
  <div v-if="stats" class="metrics">
    <div v-for="kind in ['coin','banknote']" :key="kind"><span>{{kind==='coin'?'Coins':'Banknotes'}}</span><strong>{{stats.counts.find(row=>row.type===kind)?.count ?? 0}}</strong></div>
    <div><span>Photos</span><strong>{{stats.photos}}</strong></div>
  </div>
  <section class="panel dashboard-start">
    <h2>{{stats && !total ? 'Add your first specimen' : 'Add to your collection'}}</h2>
    <p>Import photographs in a batch, then review the suggestions before saving. You can also enter a coin or banknote by hand.</p>
    <div class="actions">
      <button class="primary" @click="$emit('imports')">Import photos</button>
      <button @click="$emit('collection',true)">Add a specimen</button>
    </div>
  </section>
  <section v-if="batches.length" class="panel">
    <div class="section-heading"><h2>Recent imports</h2><button @click="$emit('imports')">View imports</button></div>
    <ul class="record-list"><li v-for="batch in batches" :key="batch.id"><strong>{{batch.label}}</strong><span>{{batch.total}} photos · {{batch.cancelled ? 'Cancelled' : batch.pending+' pending'}}</span></li></ul>
  </section>
  <section v-if="stats?.portfolio.valuedItems" class="panel">
    <h2>Estimated portfolio value</h2>
    <p class="value">{{usd.format(stats.portfolio.low)}} – {{usd.format(stats.portfolio.high)}}</p>
    <p>{{stats.portfolio.valuedItems}} of {{total}} specimens have sufficient USD evidence.</p>
    <button @click="$emit('collection',false)">View collection</button>
  </section>
  <section class="panel">
    <h2>Plan your collection</h2><p>Track a theme against the pieces you own and see what is missing.</p>
    <div class="actions"><button @click="$emit('themes')">Open themes</button><a class="button" href="/help">Read the collector guide</a></div>
  </section>
</template>
