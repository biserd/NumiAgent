<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { cleanItem, emptyItem, message, photoURL, preparePhoto, request } from './api'
import type { Candidate, Folder, Link, Photo, RecordForm, ScanReview, Specimen } from './api'
import ItemFields from './ItemFields.vue'
import PrivatePhoto from './PrivatePhoto.vue'
import OpinionCard from './OpinionCard.vue'
const props = defineProps<{startWithNew?:boolean;openedSpecimen?:string}>()
const rows=ref<Specimen[]>([])
const folders=ref<Folder[]>([])
const selected=ref<string[]>([])
const bulkFields=[['tags','Tags'],['grade','Grade'],['issuer','Issuer'],['ruler','Ruler'],['denomination','Denomination'],
  ['year','Year'],['reference','Reference'],['collection_id','Collection folder']] as const
const bulkField=ref<typeof bulkFields[number][0]>('tags')
const bulkValue=ref('')
const active=ref<string|null>(null)
const form=ref<RecordForm>(emptyItem())
const detail=ref<Specimen|null>(null)
const uploadBatches=ref<{id:string;label:string}[]>([])
const uploadPhotos=ref<Photo[]>([])
const uploadBatch=ref('')
const attachPhoto=ref('')
const attachSide=ref<Link['side']>('obverse')
const photosChanged=ref(false)
const visualSearch=ref<{candidates:Candidate[];scan?:ScanReview}|null>(null)
const visualSearching=ref(false)
const addingPhoto=ref(false)
const visualError=ref('')
const next=ref<number|null>(null)
const query=ref('')
const type=ref('')
const collection=ref('')
const sort=ref('recent')
const layout=ref('grid')
const folderName=ref('')
const editingFolder=ref(false)
const error=ref('')
const notice=ref('')
const valCurrency=ref('USD')
type Sale = {id:string;url:string;house:string;date:string;basis:string;amount:number;currency:string;premium:number|null;lot:string;auction:string;grade:string;verification:string;match:string}
type SaleSuggestion = Omit<Sale,'id'|'verification'|'premium'> & {premium?:number|null;fx?:Fx}
type Fx = {currency:string;rate:number;date:string;source:string}
type Valuation = {range:{low:number;median:number;high:number}|null;status:string;used:string[];evidence:Sale[];currency:string;asOf:string;
  normalized:{id:string;amount:number;currency:string;fx?:Fx}[]}
const estimate=ref<Valuation|null>(null)
const newSale=()=>({url:'',date:'',currency:'USD',basis:'hammer',amount:0,premium:undefined as number|undefined,house:'',auction:'',lot:'',grade:'',match:'strong',sourceChecked:false})
const sale=ref(newSale())
const saleForm=ref<HTMLDetailsElement|null>(null)
const price=(value:number,currency:string)=>new Intl.NumberFormat('en',{style:'currency',currency}).format(value)
const rate=ref<Fx>({currency:'USD',rate:0,date:'',source:''})
const ecbContext=ref('')
const useRate=ref(false)
type OcreType={id:string;label:string;source:string;attribution:string;license:string;obverse:{legend:string|null};reverse:{legend:string|null}}
const ocreId=ref('')
const ocreType=ref<OcreType|null>(null)
const saleImport=ref<({url:string;amount:number;currency?:string} & Record<string,unknown>)[]>([])
const attestImport=ref(false)
const saleResearch=ref<{status:string;results:SaleSuggestion[]}|null>(null)
async function action(fn:()=>Promise<unknown>){
  error.value='';notice.value=''
  try {await fn()}catch(e){error.value=message(e)}
}
onMounted(()=>action(async()=>{
  folders.value=await request('/collections')
  if(props.startWithNew) create()
  await load()
  if(props.openedSpecimen) await open(props.openedSpecimen)
}))
async function load(page=0){
  const params = new URLSearchParams({q:query.value,type:type.value,collection:collection.value,sort:sort.value,page:String(page)})
  const result=await request<{items:Specimen[];next:number|null}>('/items?'+params)
  rows.value=page ? [...rows.value,...result.items]:result.items
  next.value=result.next
  if(!page) selected.value=[]
}
async function open(id:string){
  const specimen=await request<Specimen>('/items/'+id)
  active.value=id;detail.value=specimen;form.value={...specimen,details:specimen.details ?? {}}
  estimate.value=null;sale.value={...newSale(),grade:specimen.grade};useRate.value=false;ecbContext.value=''
  ocreId.value=specimen.details?.referenceUrl?.toString() ?? '';ocreType.value=null;saleImport.value=[];attestImport.value=false;saleResearch.value=null
  photosChanged.value=false;uploadBatch.value='';attachPhoto.value='';uploadPhotos.value=[]
  visualSearch.value=null;visualError.value=''
  await refreshValue()
}
function create(){
  active.value='new';detail.value=null;form.value={...emptyItem(),collection_id:folders.value[0]?.id ?? null}
  ocreId.value='';ocreType.value=null;saleImport.value=[];attestImport.value=false
  photosChanged.value=false
}
async function chooseBatch() {
  attachPhoto.value=''
  uploadPhotos.value=[]
  if (!uploadBatch.value) return
  const result=await request<{photos:Photo[]}>('/imports/'+uploadBatch.value)
  uploadPhotos.value=result.photos.filter(photo=>['manual','review','saved','failed'].includes(photo.state))
}
function attach() {
  if (!attachPhoto.value) return
  const links=form.value.photos ?? []
  if (links.some(link=>link.photoId===attachPhoto.value && link.side===attachSide.value) || links.length>=12) return
  form.value.photos=[...links,{photoId:attachPhoto.value,side:attachSide.value}]
  photosChanged.value=true
  attachPhoto.value=''
}
async function save(){
  if (active.value==='new') {
    const {id}=await request<{id:string}>('/items','POST',cleanItem(form.value))
    await open(id)
  } else if(active.value) {
    const {photos,...fields}=form.value
    await request('/items/'+active.value,'PUT',cleanItem({...fields,photos:photosChanged.value ? photos : undefined}))
    await open(active.value)
  }
  await load();notice.value='Specimen saved.'
}
async function remove(){
  if(!active.value || !confirm('Delete this physical specimen and its sale records?')) return
  await request('/items/'+active.value,'DELETE')
  active.value=null;await load()
}
async function refreshValue(){
  if(active.value && active.value!=='new') estimate.value=await request('/valuations/'+active.value+'?currency='+encodeURIComponent(valCurrency.value))
}
async function recordSale(){
  if(useRate.value && ecbContext.value && ecbContext.value!==rateQuery().toString()){
    throw new Error('Look up the ECB rate again after changing the sale date or currencies.')
  }
  await request('/valuations/'+active.value+'/sales','POST',[{...sale.value,fx:useRate.value ? rate.value:undefined}])
  valCurrency.value=useRate.value ? rate.value.currency : sale.value.currency
  useRate.value=false;ecbContext.value=''
  sale.value={...newSale(),grade:form.value.grade,currency:valCurrency.value}
  await refreshValue()
}
const rateQuery=()=>new URLSearchParams({from:sale.value.currency.toUpperCase(),to:rate.value.currency.toUpperCase(),date:sale.value.date})
async function lookupRate(){
  const query=rateQuery().toString()
  const specimen=active.value
  const result=await request<Fx>('/exchange-rates?'+query)
  if(specimen!==active.value || query!==rateQuery().toString()) return
  rate.value={currency:result.currency,rate:result.rate,date:result.date,source:result.source}
  ecbContext.value=query
  notice.value='ECB reference rate loaded for '+result.date+'.'
}
async function lookupOcre(){
  ocreType.value=null
  ocreType.value=await request('/references/ocre?id='+encodeURIComponent(ocreId.value))
}
async function searchCoinPhotos(){
  const id=detail.value?.id
  if (!id || visualSearching.value) return
  visualSearching.value=true
  visualSearch.value=null;visualError.value=''
  try {
    const result=await request<NonNullable<typeof visualSearch.value>>('/imports/refine/'+id,'POST',{searchReferences:true})
    if (active.value===id) visualSearch.value=result
  } catch (e) {
    if (active.value===id) visualError.value=message(e)
  } finally { visualSearching.value=false }
}
async function addPhoto(event:Event){
  const input=event.target as HTMLInputElement
  const file=input.files?.[0]
  const specimen=detail.value
  input.value=''
  if (!file || !specimen || addingPhoto.value) return
  addingPhoto.value=true
  await action(async()=>{
    const prepared=await preparePhoto(file)
    const batch=crypto.randomUUID()
    const photos=specimen.photos ?? []
    const side=!photos.length ? 'obverse' : photos.length===1 ? (photos[0].side==='reverse' ? 'obverse' : 'reverse') : 'overview'
    await request('/imports','POST',{id:batch,label:'Additional specimen photo',analyze:false,consent:false})
    const {id:photoId}=await request<{id:string}>('/imports/'+batch+'/photos','PUT',prepared)
    await request('/items/'+specimen.id+'/photo-links','POST',{photoId,side})
    if (active.value===specimen.id) {
      await open(specimen.id)
      notice.value='Photo added to this specimen.'
      await searchCoinPhotos()
    }
  })
  addingPhoto.value=false
}
function useObservation(observation:Candidate){
  const {type,title,issuer,ruler,year,denomination,reference,details}=observation
  form.value={...form.value,type,title,issuer:issuer || form.value.issuer,ruler:ruler || form.value.ruler,
    denomination:denomination || form.value.denomination,year:year || form.value.year,reference:reference || form.value.reference,
    details:{...form.value.details,...Object.fromEntries(Object.entries(details ?? {}).filter(([,value])=>!!value))}}
  notice.value='Review and save these details.'
}
function useOcre(){
  if(!ocreType.value) return
  form.value.reference=ocreType.value.id
  form.value.details={...form.value.details,referenceUrl:ocreType.value.source}
  notice.value='Reference attached. Save the specimen to keep it.'
}
async function previewSales(event:Event){
  const input=event.target as HTMLInputElement
  const file=input.files?.[0]
  input.value='';saleImport.value=[];attestImport.value=false
  if(!file) return
  await action(async()=>{
    if(file.size>256*1024) throw new Error('Choose an auction evidence file under 256 KB.')
    const rows=JSON.parse(await file.text())
    if(!Array.isArray(rows) || rows.length<1 || rows.length>30 ||
      rows.some(row=>!row || typeof row!=='object' || typeof row.url!=='string' || !row.url.startsWith('https://') || typeof row.amount!=='number')) {
      throw new Error('Use a JSON array of 1–30 sale records with original lot URLs and realized prices.')
    }
    saleImport.value=rows
  })
}
async function importSales(){
  if(!active.value || !attestImport.value) return
  const rows=saleImport.value.map(row=>({...row,sourceChecked:true}))
  await request('/valuations/'+active.value+'/sales','POST',rows)
  saleImport.value=[];attestImport.value=false
  await refreshValue()
  notice.value='Sale evidence imported. Existing lot URLs were kept.'
}
async function findSales(){
  if(!active.value || active.value==='new') return
  saleResearch.value=await request('/valuations/'+active.value+'/research')
}
function reviewSale(entry:SaleSuggestion){
  const {fx,...fields}=entry
  useRate.value=!!fx;ecbContext.value=''
  if(fx) rate.value=fx
  sale.value={...fields,premium:entry.premium ?? undefined,sourceChecked:false}
  if(saleForm.value){
    saleForm.value.open=true
    saleForm.value.querySelector('input')?.focus()
  }
  notice.value='Review the lot, grade, and price before saving the sale.'
}
async function addFolder(){
  const name=folderName.value.trim()
  if(!name) return
  if(editingFolder.value && collection.value) await request('/collections/'+collection.value,'PUT',{name})
  else await request('/collections','POST',{name})
  folders.value=await request('/collections');folderName.value='';editingFolder.value=false
}
async function removeFolder(){
  if(!collection.value || !confirm('Delete the selected collection folder? Its specimens will be unfiled.')) return
  await request('/collections/'+collection.value,'DELETE')
  collection.value='';folders.value=await request('/collections');await load()
}
async function bulkEdit(){
  const value=bulkField.value==='collection_id' ? bulkValue.value || null : bulkValue.value.trim()
  const {updated}=await request<{updated:number}>('/items/bulk','PATCH',{ids:selected.value,changes:{[bulkField.value]:value}})
  if(active.value && selected.value.includes(active.value)) await open(active.value)
  await load()
  bulkValue.value=''
  notice.value='Updated '+updated+' specimen'+(updated===1?'':'s')+'.'
}
async function importJson(event:Event) {
  const field=event.target as HTMLInputElement
  const file=field.files?.[0];field.value=''
  if(!file)return
  await action(async()=>{
    const input=JSON.parse(await file.text())
    const data=Array.isArray(input) ? input : input.items
    if(!Array.isArray(data) || !data.length || data.length>2000) throw new Error('Use a JSON specimen array of 1–2,000 records.')
    let saved=0
    try {
      for(let i=0;i<data.length;i+=25){
        const chunk=data.slice(i,i+25).map(({id:_id,user_id:_user,photos:_photos,details,...fields})=>({
          ...fields,collection_id:null,details:typeof details==='string' ? JSON.parse(details):details}))
        await request('/items/bulk','POST',chunk)
        saved+=chunk.length
      }
    } catch(e){throw new Error(saved+' imported. '+message(e))}
    await load();notice.value=saved+' specimens imported.'
  })
}
async function importNumisGraph(event:Event) {
  const field=event.target as HTMLInputElement
  const file=field.files?.[0]
  field.value=''
  if (!file) return
  await action(async()=>{
    if (file.size>10*1024*1024) throw new Error('Choose a portfolio export of 10 MB or less.')
    const coins=JSON.parse(await file.text())
    if (!Array.isArray(coins) || !coins.length) throw new Error('Choose a JSON array of coin records from your existing portfolio.')
    const counts={imported:0,skipped:0,legacyPhotoLinks:0}
    try {
      for (let offset=0;offset<coins.length;offset+=25) {
        const result=await request<typeof counts>('/items/import/numisgraph','POST',{collectionId:collection.value || null,coins:coins.slice(offset,offset+25)})
        counts.imported+=result.imported
        counts.skipped+=result.skipped
        counts.legacyPhotoLinks+=result.legacyPhotoLinks
      }
    } catch (e) {
      await load()
      throw new Error(counts.imported+' imported, '+counts.skipped+' already present. '+message(e))
    }
    await load()
    const noun=counts.imported===1?'specimen':'specimens'
    notice.value=counts.imported+' '+noun+' imported · '+counts.skipped+' already present · '+counts.legacyPhotoLinks+' photo references to reconcile'
  })
}
</script>
<template>
  <div class="section-heading"><div><h1>My collection</h1><p>Coins, banknotes, and the records that go with them.</p></div><button class="primary" @click="create">Add specimen</button></div>
  <p role="alert" class="error" v-if="error">{{error}}</p><p role="status" v-if="notice">{{notice}}</p>
  <section v-if="active" class="panel">
    <div class="section-heading"><h2>{{active==='new'?'New specimen':detail?.title}}</h2><button @click="active=null">Close specimen</button></div>
    <div v-if="form.photos?.length" class="photo-grid specimen-images"><figure v-for="(link,index) in form.photos" :key="index"><PrivatePhoto :id="link.photoId" :description="link.side" :crop="link.crop"/><figcaption>{{link.side}}</figcaption></figure></div>
    <OpinionCard v-if="detail && (detail.photos?.length || detail.photo)" :key="detail.id" :piece="detail"/>
    <label v-if="detail && (detail.photos?.length ?? 0)<12">
      {{addingPhoto ? 'Adding photo…' : detail.photos?.length===1 ? 'Add the other side' : 'Add a photo'}}
      <input type="file" accept="image/*,.heic,.heif" :disabled="addingPhoto || photosChanged" @change="addPhoto">
    </label>
    <details v-if="active!=='new'" @toggle="($event.target as HTMLDetailsElement).open && action(async()=>{uploadBatches=await request('/imports')})">
      <summary>Link an imported photo</summary>
      <div class="form-grid">
        <label>Photo import batch<select v-model="uploadBatch" @change="action(chooseBatch)"><option value="">Select a batch</option><option v-for="batch in uploadBatches" :key="batch.id" :value="batch.id">{{batch.label}}</option></select></label>
        <label>Imported photo<select v-model="attachPhoto"><option value="">Select a photo</option><option v-for="(photo,index) in uploadPhotos" :key="photo.id" :value="photo.id">{{photo.candidates[0]?.title || 'Photo '+(index+1)}}</option></select></label>
        <label>Side<select v-model="attachSide"><option value="obverse">Obverse</option><option value="reverse">Reverse</option><option value="overview">Overview</option></select></label>
      </div>
      <img v-if="attachPhoto" class="pair-preview" :src="photoURL(attachPhoto)" alt="Selected private photo">
      <button :disabled="!attachPhoto || (form.photos?.length ?? 0)>=12 || !!form.photos?.some(photo=>photo.photoId===attachPhoto && photo.side===attachSide)" @click="attach">Add photo link</button>
      <p v-if="photosChanged">Save the specimen to keep these photo links.</p>
    </details>
    <p v-if="detail?.duplicates?.length">Same catalog reference on {{detail.duplicates.length}} other specimen(s).</p>
    <p v-if="form.details.referenceUrl"><a :href="String(form.details.referenceUrl)" target="_blank" rel="noopener noreferrer">Open the linked catalog reference ↗</a></p>
    <details v-if="detail?.photos?.length" :key="detail.id" :open="visualSearching || !!visualSearch || !!visualError">
      <summary>Improve identification</summary>
      <button type="button" :disabled="visualSearching || photosChanged" @click="searchCoinPhotos">Check photos and references</button>
      <p v-if="visualSearching" role="status">Reading photos and checking references…</p>
      <p v-if="visualError" role="alert">{{visualError}}</p>
      <div v-if="visualSearch" aria-live="polite">
        <button v-for="(candidate,index) in visualSearch.candidates" :key="index" @click="useObservation(candidate)">Review {{candidate.title}}</button>
        <p v-if="visualSearch.scan?.next">{{visualSearch.scan.next}}</p>
        <p v-if="Object.values(visualSearch.scan?.providers ?? {}).includes('unavailable')">Some reference sources were unavailable.</p>
        <ul v-if="visualSearch.scan?.leads.length" aria-label="Possible references">
          <li v-for="hit in visualSearch.scan.leads" :key="hit.source">
            <a :href="hit.source" target="_blank" rel="noopener noreferrer">{{hit.label}}</a>
            <span v-if="hit.attribution"> · {{hit.attribution}}</span>
            <div v-if="hit.obverse">{{hit.obverse}}</div><div v-if="hit.reverse">{{hit.reverse}}</div>
            <p v-if="hit.excerpt">{{hit.excerpt}}</p>
            <small v-if="hit.conflicts?.length">{{hit.conflicts.join('. ')}}</small>
          </li>
        </ul>
      </div>
    </details>
    <details v-if="form.type==='coin'"><summary>Look up a Roman coin type in OCRE</summary>
      <form class="inline" @submit.prevent="action(lookupOcre)">
        <label>OCRE identifier or record URL<input v-model.trim="ocreId" maxlength="180" required placeholder="ric.1(2).aug.208"></label>
        <button>Look up type</button>
      </form>
      <div v-if="ocreType">
        <p><a :href="ocreType.source" target="_blank" rel="noopener noreferrer">{{ocreType.label}} ↗</a></p>
        <p v-if="ocreType.obverse.legend">Obverse legend {{ocreType.obverse.legend}}</p>
        <p v-if="ocreType.reverse.legend">Reverse legend {{ocreType.reverse.legend}}</p>
        <small>{{ocreType.attribution}} · {{ocreType.license}}</small>
        <button type="button" @click="useOcre">Attach this reference</button>
      </div>
    </details>
    <form @submit.prevent="action(save)"><ItemFields v-model="form" :folders="folders"/><div class="actions"><button class="primary">Save specimen</button><button v-if="active!=='new'" type="button" @click="action(remove)">Delete specimen</button></div></form>
    <div v-if="active!=='new'" class="valuation">
      <h2>Auction valuation</h2>
      <form class="inline" @submit.prevent="action(refreshValue)"><label>Currency<input v-model.trim="valCurrency" maxlength="3" pattern="[A-Z]{3}" required></label><button>Refresh valuation</button></form>
      <p v-if="estimate?.range" class="value">{{price(estimate.range.low,estimate.currency)}} – {{price(estimate.range.high,estimate.currency)}}</p>
      <p v-else-if="estimate" class="status">Insufficient market evidence</p>
      <p v-if="estimate">As of {{estimate.asOf}}. A range requires three strong, recent matches on a comparable grade and premium basis. Conversions use recorded rates.</p>
      <details><summary>Research comparable sales</summary>
        <p>Search an approved realized-sale feed for the saved catalog reference. Check the original lot and condition before adding evidence.</p>
        <button type="button" @click="action(findSales)">Look for sale records</button>
        <p v-if="saleResearch?.status==='provider_not_configured'">NumiAgent doesn’t have a completed-sales feed connected.</p>
        <p v-else-if="saleResearch?.status==='unavailable'">The realized-sale provider is unavailable.</p>
        <p v-else-if="saleResearch?.status==='reference_required'">Save a catalog reference to search for the same type.</p>
        <p v-else-if="saleResearch?.status==='no_matches'">No exact-reference sales were returned.</p>
        <ul v-if="saleResearch?.results.length" class="record-list">
          <li v-for="entry in saleResearch.results" :key="entry.url">
            <a :href="entry.url" target="_blank" rel="noopener noreferrer">{{entry.house}} · {{entry.auction}} · Lot {{entry.lot}} ↗</a>
            <span>{{entry.date}} · {{price(entry.amount,entry.currency)}} · {{entry.basis==='hammer'?'Hammer':'With premium'}}</span>
            <button type="button" @click="reviewSale(entry)">Review this sale</button>
          </li>
        </ul>
      </details>
      <ul class="record-list">
        <li v-for="entry in estimate?.evidence ?? []" :key="entry.id">
          <a :href="entry.url" target="_blank" rel="noopener noreferrer">{{entry.house}} · {{entry.auction}} · Lot {{entry.lot}} ↗</a>
          <span>{{entry.date}} · {{price(entry.amount,entry.currency)}} · {{entry.basis==='hammer'?'Hammer':'With premium'}}{{entry.premium==null?'':' · '+entry.premium+'% premium'}}</span>
          <small>Collector-attested · {{entry.match}} match · {{estimate?.used.includes(entry.id)?'Eligible evidence':'Excluded from range'}}</small>
          <template v-for="normalized in estimate?.normalized.filter(v=>v.id===entry.id && v.fx) ?? []" :key="normalized.id">
            <small>{{price(normalized.amount,normalized.currency)}} including premium · Rate {{normalized.fx?.rate}} on {{normalized.fx?.date}}</small>
            <a :href="normalized.fx?.source" target="_blank" rel="noopener noreferrer">Exchange-rate source ↗</a>
          </template>
        </li>
      </ul>
      <details ref="saleForm"><summary>Record a realized sale</summary>
        <form @submit.prevent="action(recordSale)">
          <div class="form-grid">
            <label>Original lot URL<input type="url" required v-model="sale.url"></label>
            <label>Auction house<input required v-model="sale.house"></label>
            <label>Auction ID<input required v-model="sale.auction"></label>
            <label>Lot number<input required v-model="sale.lot"></label>
            <label>Sale date<input type="date" required v-model="sale.date"></label>
            <label>Currency<input minlength="3" maxlength="3" pattern="[A-Z]{3}" required v-model.trim="sale.currency"></label>
            <label>Realized price<input type="number" required min=".01" step=".01" v-model.number="sale.amount"></label>
            <label>Price basis<select v-model="sale.basis"><option value="hammer">Hammer</option><option value="with_premium">With buyer’s premium</option></select></label>
            <label>Buyer’s premium (%)<input type="number" min="0" max="100" step=".01" :value="sale.premium" @input="sale.premium=Number.isNaN(($event.target as HTMLInputElement).valueAsNumber) ? undefined : ($event.target as HTMLInputElement).valueAsNumber"></label>
            <label>Grade<input v-model="sale.grade"></label>
            <label>Match<select v-model="sale.match"><option value="strong">Strong</option><option value="possible">Possible</option></select></label>
          </div>
          <label class="check"><input v-model="useRate" type="checkbox">Record an exchange rate for this sale</label>
          <div v-if="useRate" class="form-grid">
            <label>Target currency<input v-model.trim="rate.currency" maxlength="3" pattern="[A-Z]{3}" required></label>
            <label>Target units per source unit<input v-model.number="rate.rate" type="number" min="0.000001" step="any" required></label>
            <label>Rate date<input v-model="rate.date" type="date" required></label>
            <label>Rate source URL<input v-model="rate.source" type="url" required></label>
            <button type="button" :disabled="!sale.date || sale.currency.length!==3 || rate.currency.length!==3" @click="action(lookupRate)">Look up ECB reference rate</button>
          </div>
          <label class="check"><input v-model="sale.sourceChecked" required type="checkbox">I checked the lot source and confirmed the realized price.</label>
          <button class="primary">Add sale evidence</button>
        </form>
      </details>
      <details><summary>Import verified sale records</summary>
        <p>Upload a JSON array of up to 30 sales. Follow the Sale schema, then confirm the realized price on each original lot page.</p>
        <p><a href="/openapi.json">OpenAPI sale schema</a></p>
        <label>Sale evidence JSON<input type="file" accept=".json,application/json" @change="previewSales"></label>
        <template v-if="saleImport.length">
          <p>{{saleImport.length}} records ready to import.</p>
          <ul class="record-list"><li v-for="(row,index) in saleImport" :key="index">
            <a :href="row.url" target="_blank" rel="noopener noreferrer">Open lot {{index+1}} ↗</a>
            <span>{{row.currency || ''}} {{row.amount}}</span>
          </li></ul>
          <label class="check"><input type="checkbox" v-model="attestImport">I checked the original lot sources and realized prices.</label>
          <button type="button" :disabled="!attestImport" @click="action(importSales)">Import sale evidence</button>
        </template>
      </details>
    </div>
  </section>
  <form class="panel filters" @submit.prevent="action(()=>load())">
    <label>Search specimens<input type="search" v-model="query" placeholder="Title, ruler, reference…"></label>
    <label>Type<select v-model="type" @change="action(()=>load())"><option value="">All types</option><option value="coin">Coins</option><option value="banknote">Banknotes</option></select></label>
    <label>Collection<select v-model="collection" @change="action(()=>load())"><option value="">All collections</option><option v-for="f in folders" :value="f.id" :key="f.id">{{f.name}}</option></select></label>
    <label>Sort<select v-model="sort" @change="action(()=>load())"><option value="recent">Newest</option><option value="title">Title</option></select></label>
    <button class="primary">Search</button><button type="button" @click="layout=layout==='grid'?'list':'grid'">{{layout==='grid'?'List view':'Grid view'}}</button>
  </form>
  <details class="panel"><summary>Collection folders, import, and export</summary>
    <form class="inline" @submit.prevent="action(addFolder)"><label>Folder name<input v-model="folderName" required></label><button>{{editingFolder?'Save folder name':'Create folder'}}</button>
      <button v-if="collection" type="button" @click="editingFolder=true;folderName=folders.find(f=>f.id===collection)?.name || ''">Rename selected folder</button>
      <button v-if="collection" type="button" @click="action(removeFolder)">Delete selected folder</button>
    </form>
    <label>Import specimen JSON<input type="file" accept=".json,application/json" @change="importJson"></label>
    <details><summary>Transfer an existing portfolio</summary><label>Import portfolio JSON<input type="file" accept=".json,application/json" @change="importNumisGraph"></label></details>
    <a href="/api/v1/items/export.csv" download>Download collection CSV</a>
    <a href="/api/v1/items/insurance.csv" download>Download insurance inventory CSV</a>
  </details>
  <form v-if="selected.length" class="panel inline" @submit.prevent="action(bulkEdit)">
    <label>Field to edit<select v-model="bulkField" @change="bulkValue=''"><option v-for="[field,label] in bulkFields" :key="field" :value="field">{{label}}</option></select></label>
    <label v-if="bulkField==='collection_id'">Destination folder<select v-model="bulkValue"><option value="">Unfiled</option><option v-for="folder in folders" :key="folder.id" :value="folder.id">{{folder.name}}</option></select></label>
    <label v-else>New value (blank clears the field)<input v-model="bulkValue" maxlength="180"></label>
    <button>Apply to {{selected.length}} selected</button>
  </form>
  <p v-if="!rows.length" class="empty">No specimens match this view.</p>
  <div :class="['collection-results',layout]">
    <article v-for="row in rows" :key="row.id" class="photo-card">
      <button class="specimen-button" @click="action(()=>open(row.id))">
        <img v-if="row.photo" loading="lazy" :src="photoURL(row.photo)" alt="">
        <span v-else class="no-photo" aria-hidden="true">{{row.type==='coin'?'◉':'▤'}}</span>
        <span class="specimen-label"><strong>{{row.title}}</strong><small>{{[row.issuer,row.year,row.reference].filter(Boolean).join(' · ') || row.type}}</small></span>
      </button>
      <label class="check"><input v-model="selected" type="checkbox" :value="row.id" :disabled="selected.length>=50 && !selected.includes(row.id)">Select {{row.title}}</label>
    </article>
  </div>
  <button v-if="next!==null" @click="action(()=>load(next!))">Load more specimens</button>
</template>
