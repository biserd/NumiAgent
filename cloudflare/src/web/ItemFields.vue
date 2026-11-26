<script setup lang="ts">
import type { Folder, RecordForm } from './api'
const item = defineModel<RecordForm>({required:true})
defineProps<{folders:Folder[]}>()
const fields = [
 ['issuer','Issuer or country'],['ruler','Ruler'],['denomination','Denomination'],['year','Year or period'],
 ['reference','Catalog reference'],['grade','Grade'],['tags','Tags']
] as const
const details = [
 ['metal','Metal'],['mint','Mint'],['mintMark','Mint mark'],['serial','Serial number'],['signatures','Signatures'],
 ['series','Series'],['variant','Variant'],['inscriptions','Inscriptions'],['obverse','Obverse description'],['reverse','Reverse description'],
 ['obverseLegend','Obverse legend'],['reverseLegend','Reverse legend'],
 ['certification','Certification'],['provenance','Provenance'],['purchaseSource','Purchase source'],['currency','Purchase currency']
] as const
const measurements = [
 ['purchasePrice','Purchase price','0.01',0], ['fees','Acquisition fees','0.01',0],
 ['weightG','Weight (g)','0.001',0], ['diameterMm','Diameter (mm)','0.01',0],
 ['dieAxis','Die axis','1',undefined], ['dateFrom','Year from','1',undefined], ['dateTo','Year to','1',undefined]
] as const
function setMeasurement(key: string,event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  item.value.details[key] = Number.isFinite(value) ? value : undefined
}
</script>
<template>
  <div class="form-grid">
    <label>Title<input v-model="item.title" required maxlength="180"></label>
    <div v-if="item.typeLocked"><strong>Piece type</strong><div>{{item.type==='coin'?'Coin':'Banknote'}}</div></div>
    <label v-else>Type<select v-model="item.type"><option value="coin">Coin</option><option value="banknote">Banknote</option></select></label>
    <label v-for="[key,label] in fields" :key="key">{{label}}<input v-model="item[key]" maxlength="180"></label>
    <label>Collection<select v-model="item.collection_id"><option :value="null">Unfiled</option><option v-for="f in folders" :key="f.id" :value="f.id">{{f.name}}</option></select></label>
  </div>
  <label>Notes<textarea v-model="item.notes" maxlength="4000"></textarea></label>
  <details><summary>Identification and acquisition details</summary><div class="form-grid">
    <label v-for="[key,label] in details" :key="key">{{label}}<input v-model="item.details[key]" :maxlength="key==='currency'?3:key==='provenance'?4000:180"></label>
    <label>Purchase date<input v-model="item.details.purchaseDate" type="date"></label>
    <label v-for="[key,label,step,min] in measurements" :key="key">{{label}}<input type="number" :step="step" :min="min" :value="item.details[key]" @input="setMeasurement(key,$event)"></label>
  </div><label>Description<textarea v-model="item.details.description" maxlength="4000"></textarea></label></details>
</template>
