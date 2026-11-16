<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { cleanItem, emptyItem, message, photoURL, request } from './api'
import type { Box, Candidate, Folder, Link, Photo, RecordForm } from './api'
import ItemFields from './ItemFields.vue'

type ImportPhoto = Photo & {side?:'obverse'|'reverse'|null}
type Batch = {id:string;label:string;analyze:number;cancelled:number;paired?:number;photos:ImportPhoto[]}
const batches=ref<{id:string;label:string;total:number;pending:number}[]>([])
const batch=ref<Batch|null>(null)
const folders=ref<Folder[]>([])
const label=ref('')
const analyze=ref(false)
const keep=ref(false)
const files=ref<File[]>([])
const failures=ref<File[]>([])
const busy=ref(false)
const done=ref(0)
const total=ref(0)
const error=ref('')
const notice=ref('')
const selected=ref<string[]>([])
const current=ref('')
const reverse=ref('')
const side=ref<Link['side']>('obverse')
const form=ref(emptyItem())
const references=ref<Candidate['referenceMatches']>([])
const box=ref<Box>({x:0,y:0,width:1,height:1})
const poll=ref<number>()
const pending=computed(()=>batch.value?.photos.filter(p=>['running','queued','uploading'].includes(p.state)).length ?? 0)
const usable=(p:Photo)=>['manual','review','saved','failed'].includes(p.state)
const reviewable=(p:ImportPhoto)=>batch.value?.paired
  ? p.side==='obverse' && (['review','failed'].includes(p.state) || (p.state==='manual' && !!p.error))
  : usable(p)
const cropPercent=(n:number)=>Math.round(n*100)
const rectStyle=computed(()=>({left:box.value.x*100+'%',top:box.value.y*100+'%',width:box.value.width*100+'%',height:box.value.height*100+'%'}))
const reverseOptions=computed(()=>batch.value?.photos.filter(p=>p.id!==current.value && usable(p)) ?? [])
const u=()=>new Date().toLocaleDateString()
onMounted(async()=>{
  try {
    await refreshList()
    folders.value=await request('/collections')
    poll.value=window.setInterval(()=>{if (batch.value && (pending.value || busy.value)) void refresh().catch(()=>{})},1800)
  } catch(e){error.value=message(e)}
})
onUnmounted(()=>window.clearInterval(poll.value))
async function refreshList(){batches.value=await request('/imports')}
async function refresh(){if(batch.value) await open(batch.value.id,false)}
async function open(id:string,reset=true){
  if(reset){error.value='';current.value='';selected.value=[]}
  try {batch.value=await request('/imports/'+id)} catch(e){error.value=message(e)}
}
function choose(event:Event,append=false){
  const input=event.target as HTMLInputElement
  const picked=Array.from(input.files ?? [])
  files.value=(append?[...files.value,...picked]:picked).slice(0,300)
  input.value=''
}
async function prepared(file:File) {
  if (keep.value && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size<=6*1024*1024) return file
  let picture:ImageBitmap|HTMLImageElement
  try { picture=await createImageBitmap(file,{imageOrientation:'from-image'}) }
  catch {
    const url=URL.createObjectURL(file)
    try {
      const image=new Image()
      image.src=url
      await image.decode()
      picture=image
    } catch {throw new Error('This format could not be decoded. Export the file as JPEG.')}
    finally{URL.revokeObjectURL(url)}
  }
  const scale=Math.min(1,1800/Math.max(picture.width,picture.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(picture.width*scale)); canvas.height=Math.max(1,Math.round(picture.height*scale))
  const painter=canvas.getContext('2d')
  if(!painter) throw new Error('Image processing unavailable')
  painter.fillStyle='#fff';painter.fillRect(0,0,canvas.width,canvas.height)
  painter.drawImage(picture,0,0,canvas.width,canvas.height)
  if('close' in picture) picture.close()
  const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.8))
  if(!result) throw new Error('Image conversion failed')
  return result
}
async function upload(list:File[], fresh:boolean){
  if(!list.length) return
  busy.value=true;error.value='';notice.value='';done.value=0;total.value=list.length
  failures.value=[]
  try {
    let id=batch.value?.id
    if(fresh || !id){
      id=crypto.randomUUID()
      await request('/imports','POST',{id,label:label.value.trim() || 'Batch · '+u(),analyze:analyze.value,consent:analyze.value})
      await open(id)
    }
    const key=id
    const remaining=[...list]
    await Promise.all(Array.from({length:Math.min(3,list.length)},async()=>{
      for(let file=remaining.shift();file;file=remaining.shift()) {
        try { await request('/imports/'+key+'/photos','PUT',await prepared(file)) }
        catch(e){failures.value.push(file);error.value=file.name+' — '+message(e)}
        finally {done.value++}
      }
    }))
    files.value=[]
    try {await refresh();await refreshList()} catch(e){error.value=message(e)}
    notice.value=(list.length-failures.value.length)+' uploaded'+(failures.value.length ? ' · '+failures.value.length+' need retry':'')
  } catch(e){error.value=message(e)}
  finally{busy.value=false}
}
function review(photo:Photo,candidate?:Candidate){
  current.value=photo.id;side.value='obverse'
  reverse.value=batch.value?.paired ? batch.value.photos.find(p=>p.side==='reverse')?.id ?? '' : ''
  if(candidate){
    const {confidence:_confidence,crop:_crop,model:_model,referenceMatches:_references,...fields}=candidate
    form.value={...emptyItem(),...fields,details:fields.details ?? {},collection_id:folders.value[0]?.id ?? null}
  } else form.value={...emptyItem(),collection_id:folders.value[0]?.id ?? null}
  references.value=candidate?.referenceMatches ?? []
  box.value=candidate?.crop ? {...candidate.crop}:{x:0,y:0,width:1,height:1}
  void document.querySelector('#review')?.scrollIntoView({block:'start'})
}
async function action(fn:()=>Promise<unknown>){
  try{error.value='';await fn();await refresh();await refreshList()}catch(e){error.value=message(e)}
}
async function save(){
  const links:Link[]=[{photoId:current.value,side:side.value,crop:box.value}]
  if(reverse.value) links.push({photoId:reverse.value,side:side.value==='reverse'?'obverse':'reverse'})
  await action(async()=>{
    await request('/items','POST',cleanItem({...form.value,photos:links}))
    current.value='';notice.value='Specimen added to your collection.'
  })
}
const bulkPhoto=(photo:Photo) => !batch.value?.paired && photo.state==='review' && photo.candidates.length===1
async function bulk(){
  if(!batch.value)return
  const eligible=batch.value.photos.filter(p=>selected.value.includes(p.id) && bulkPhoto(p))
  await action(async()=>{
    for(let i=0;i<eligible.length;i+=20) {
      const chunk=eligible.slice(i,i+20)
      await request('/items/bulk','POST',chunk.map(p=>({...p.candidates[0],collection_id:folders.value[0]?.id ?? null,
        photos:[{photoId:p.id,side:'overview',crop:p.candidates[0].crop}]})))
      selected.value=selected.value.filter(id=>!chunk.some(photo=>photo.id===id))
    }
    notice.value=eligible.length+' specimens saved.'
  })
}
</script>
<template>
  <h1>Photo imports</h1>
  <p role="alert" class="error" v-if="error">{{error}}</p><p role="status" v-if="notice">{{notice}}</p>
  <section class="panel">
    <h2>Upload photographs</h2>
    <div class="form-grid">
      <label>Batch label<input v-model="label" :disabled="busy" placeholder="e.g. Second tray"></label>
      <label>Photo library<input aria-label="Photo library" type="file" accept="image/*,.heic,.heif" multiple :disabled="busy" @change="choose($event)"></label>
      <label>Camera<input aria-label="Camera" type="file" accept="image/*" capture="environment" :disabled="busy" @change="choose($event,true)"></label>
    </div>
    <label class="check"><input type="checkbox" v-model="analyze" :disabled="busy">I consent to Workers AI analyzing photographs in this new batch.</label>
    <label class="check"><input type="checkbox" v-model="keep" :disabled="busy">Keep compatible originals up to 6 MB. Other files are converted to JPEG when supported.</label>
    <div class="actions">
      <button class="primary" :disabled="!files.length || busy" @click="upload(files,true)">Start new batch{{files.length ? ' ('+files.length+')':''}}</button>
      <button v-if="batch && !batch.cancelled && !batch.paired" :disabled="!files.length || busy" @click="upload(files,false)">Add to open batch</button>
      <button v-if="failures.length" :disabled="busy" @click="upload(failures,false)">Retry {{failures.length}} uploads</button>
    </div>
    <label v-if="busy">Upload attempts {{done}} of {{total}}<progress :value="done" :max="total"></progress></label>
  </section>
  <label v-if="batches.length">Open an import<select :value="batch?.id || ''" :disabled="busy" @change="open(($event.target as HTMLSelectElement).value)"><option value="" disabled>Select a batch</option><option v-for="b in batches" :key="b.id" :value="b.id">{{b.label}} ({{b.total}})</option></select></label>
  <section v-if="batch" class="panel">
    <div class="section-heading"><div><h2>{{batch.label}}</h2><p>{{batch.photos.length-pending}} of {{batch.photos.length}} uploads processed · {{batch.analyze ? 'AI requested':'Manual review'}}</p></div>
      <button v-if="!batch.cancelled" :disabled="busy" @click="action(()=>request('/imports/'+batch!.id+'/cancel','POST'))">Cancel pending work</button></div>
    <button v-if="selected.length" class="primary" @click="bulk">Save {{selected.length}} reviewed candidates</button>
    <div class="photo-grid">
      <article class="photo-card" v-for="(p,index) in batch.photos" :key="p.id">
        <img v-if="p.state!=='uploading'" loading="lazy" :src="photoURL(p.id)" :alt="'Photo '+(index+1)">
        <div><span class="status">{{p.side ? (p.side==='obverse' ? 'Front' : 'Back')+' · ' : ''}}{{p.state}}</span><small v-if="p.error">{{p.error}}</small>
          <button v-if="p.state==='failed' && p.side!=='reverse'" @click="action(()=>request('/photos/'+p.id+'/retry','POST'))">Retry analysis</button>
          <template v-if="reviewable(p)">
            <button v-for="(candidate,i) in p.candidates" :key="i" @click="review(p,candidate)">{{candidate.title}} · {{Math.round(candidate.confidence*100)}}%</button>
            <button @click="review(p)">Catalog manually</button>
            <label class="check" v-if="bulkPhoto(p)"><input v-model="selected" type="checkbox" :value="p.id">Approve candidate</label>
          </template>
        </div>
      </article>
    </div>
  </section>
  <section id="review" class="panel">
    <template v-if="current">
      <h2>Review specimen</h2>
      <ul v-if="references?.length" class="record-list" aria-label="Reference matches">
        <li v-for="reference in references" :key="reference.source">
          <a :href="reference.source" target="_blank" rel="noopener noreferrer">{{reference.label}} ↗</a>
          <small>{{reference.kind}} · {{reference.attribution}} · {{reference.license}}</small>
        </li>
      </ul>
      <div class="crop-frame"><img :src="photoURL(current)" alt="Original photo and indicated crop"><div :style="rectStyle"></div></div>
      <form @submit.prevent="save">
        <fieldset><legend>Crop (% of the original photo)</legend><div class="form-grid">
          <label v-for="key in (['x','y','width','height'] as const)" :key="key">{{key}}
            <input type="number" min="0" max="100" required :value="cropPercent(box[key])" @input="box[key]=Number(($event.target as HTMLInputElement).value)/100">
          </label>
        </div></fieldset>
        <div class="form-grid" v-if="!batch?.paired">
          <label>Photo side<select v-model="side"><option value="obverse">Obverse</option><option value="reverse">Reverse</option><option value="overview">Overview</option></select></label>
          <label>Pair with another photo<select v-model="reverse"><option value="">No pairing</option><option v-for="other in reverseOptions" :key="other.id" :value="other.id">Photo {{(batch?.photos.findIndex(p=>p.id===other.id) ?? 0)+1}} · {{other.candidates[0]?.title ?? other.state}}</option></select></label>
        </div>
        <img class="pair-preview" v-if="reverse" :src="photoURL(reverse)" alt="Paired photograph">
        <ItemFields v-model="form" :folders="folders"/>
        <button class="primary">Save specimen</button>
        <button type="button" @click="current=''">Close review</button>
      </form>
    </template>
    <p v-else>Open a processed photo to review an identification, adjust the crop, or pair two sides.</p>
  </section>
</template>
