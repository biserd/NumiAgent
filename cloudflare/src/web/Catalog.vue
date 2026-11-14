<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { cleanItem, emptyItem, message, photoURL, request } from './api'
import type { Folder, Link, Photo, RecordForm, Specimen } from './api'
import ItemFields from './ItemFields.vue'
import PrivatePhoto from './PrivatePhoto.vue'
const rows=ref<Specimen[]>([])
const folders=ref<Folder[]>([])
const selected=ref<string[]>([])
const active=ref<string|null>(null)
const form=ref<RecordForm>(emptyItem())
const detail=ref<Specimen|null>(null)
const uploadBatches=ref<{id:string;label:string}[]>([])
const uploadPhotos=ref<Photo[]>([])
const uploadBatch=ref('')
const attachPhoto=ref('')
const attachSide=ref<Link['side']>('obverse')
const photosChanged=ref(false)
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
type Fx = {currency:string;rate:number;date:string;source:string}
type Valuation = {range:{low:number;median:number;high:number}|null;status:string;used:string[];evidence:Sale[];currency:string;asOf:string;
  normalized:{id:string;amount:number;currency:string;fx?:Fx}[]}
const estimate=ref<Valuation|null>(null)
const newSale=()=>({url:'',date:'',currency:'USD',basis:'hammer',amount:0,premium:undefined as number|undefined,house:'',auction:'',lot:'',grade:'',match:'strong',sourceChecked:false})
const sale=ref(newSale())
const price=(value:number,currency:string)=>new Intl.NumberFormat('en',{style:'currency',currency}).format(value)
const rate=ref<Fx>({currency:'USD',rate:0,date:'',source:''})
const useRate=ref(false)
async function action(fn:()=>Promise<unknown>){
  error.value='';notice.value=''
  try {await fn()}catch(e){error.value=message(e)}
}
onMounted(()=>action(async()=>{folders.value=await request('/collections');await load()}))
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
  estimate.value=null;sale.value={...newSale(),grade:specimen.grade};useRate.value=false
  photosChanged.value=false;uploadBatch.value='';attachPhoto.value='';uploadPhotos.value=[]
  await refreshValue()
}
function create(){
  active.value='new';detail.value=null;form.value={...emptyItem(),collection_id:folders.value[0]?.id ?? null}
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
  await request('/valuations/'+active.value+'/sales','POST',[{...sale.value,fx:useRate.value ? rate.value:undefined}])
  valCurrency.value=useRate.value ? rate.value.currency : sale.value.currency
  useRate.value=false
  sale.value={...newSale(),grade:form.value.grade,currency:valCurrency.value}
  await refreshValue()
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
async function bulkMove(){
  for(let i=0;i<selected.value.length;i+=20){
    const payload=rows.value.filter(row=>selected.value.slice(i,i+20).includes(row.id)).map(row=>cleanItem({...row,collection_id:collection.value || null}))
    await request('/items/bulk','POST',payload)
  }
  await load();notice.value='Selected specimens moved.'
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
    if (file.size>10*1024*1024) throw new Error('Choose a NumisGraph export of 10 MB or less.')
    const coins=JSON.parse(await file.text())
    if (!Array.isArray(coins) || !coins.length) throw new Error('Choose the JSON array exported from the signed-in NumisGraph coin list.')
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
    notice.value=counts.imported+' NumisGraph specimens imported · '+counts.skipped+' already present · '+counts.legacyPhotoLinks+' photo references to reconcile'
  })
}
</script>
<template>
  <div class="section-heading"><div><h1>My collection</h1><p>Coins, banknotes, and the records that go with them.</p></div><button class="primary" @click="create">Add specimen</button></div>
  <p role="alert" class="error" v-if="error">{{error}}</p><p role="status" v-if="notice">{{notice}}</p>
  <section v-if="active" class="panel">
    <div class="section-heading"><h2>{{active==='new'?'New specimen':detail?.title}}</h2><button @click="active=null">Close specimen</button></div>
    <div v-if="form.photos?.length" class="photo-grid specimen-images"><figure v-for="(link,index) in form.photos" :key="index"><PrivatePhoto :id="link.photoId" :description="link.side" :crop="link.crop"/><figcaption>{{link.side}}</figcaption></figure></div>
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
    <form @submit.prevent="action(save)"><ItemFields v-model="form" :folders="folders"/><div class="actions"><button class="primary">Save specimen</button><button v-if="active!=='new'" type="button" @click="action(remove)">Delete specimen</button></div></form>
    <div v-if="active!=='new'" class="valuation">
      <h2>Auction valuation</h2>
      <form class="inline" @submit.prevent="action(refreshValue)"><label>Currency<input v-model.trim="valCurrency" maxlength="3" pattern="[A-Z]{3}" required></label><button>Refresh valuation</button></form>
      <p v-if="estimate?.range" class="value">{{price(estimate.range.low,estimate.currency)}} – {{price(estimate.range.high,estimate.currency)}}</p>
      <p v-else-if="estimate" class="status">Insufficient market evidence</p>
      <p v-if="estimate">As of {{estimate.asOf}}. A range requires three strong, recent matches on a comparable grade and premium basis. Conversions use recorded rates.</p>
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
      <details><summary>Record a realized sale</summary>
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
          </div>
          <label class="check"><input v-model="sale.sourceChecked" required type="checkbox">I checked the lot source and confirmed the realized price.</label>
          <button class="primary">Add sale evidence</button>
        </form>
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
    <label>Import NumisGraph coin JSON<input type="file" accept=".json,application/json" @change="importNumisGraph"></label>
    <a href="/api/v1/items/export.csv" download>Download collection CSV</a>
  </details>
  <button v-if="selected.length" @click="action(bulkMove)">Move {{selected.length}} to {{folders.find(f=>f.id===collection)?.name ?? 'Unfiled'}}</button>
  <p v-if="!rows.length" class="empty">No specimens match this view.</p>
  <div :class="['collection-results',layout]">
    <article v-for="row in rows" :key="row.id" class="photo-card">
      <button class="specimen-button" @click="action(()=>open(row.id))">
        <img v-if="row.photo" loading="lazy" :src="photoURL(row.photo)" alt="">
        <span v-else class="no-photo" aria-hidden="true">{{row.type==='coin'?'◉':'▤'}}</span>
        <span class="specimen-label"><strong>{{row.title}}</strong><small>{{[row.issuer,row.year,row.reference].filter(Boolean).join(' · ') || row.type}}</small></span>
      </button>
      <label class="check"><input v-model="selected" type="checkbox" :value="row.id">Select {{row.title}}</label>
    </article>
  </div>
  <button v-if="next!==null" @click="action(()=>load(next!))">Load more specimens</button>
</template>
