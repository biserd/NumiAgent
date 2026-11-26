<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref } from 'vue'
import { cleanItem, emptyItem, message, photoURL, preparePhoto, request } from './api'
import type { Box, Candidate, Folder, Link, Photo, RecordForm, ScanReview } from './api'
import ItemFields from './ItemFields.vue'
import PhotoViewer from './PhotoViewer.vue'

defineEmits<{specimen:[id:string]}>()
type ImportPhoto = Photo & {side?:'obverse'|'reverse'|null;slot?:number|null;record?:{id:string;title:string}|null;scan?:ScanReview}
type Batch = {id:string;label:string;analyze:number;cancelled:number;paired?:number;expected_photos?:number|null;photos:ImportPhoto[]}
type DraftGroup={id:number;photos:File[]}
type Upload={id:string;slots:{name:string;photo:Blob;slot?:number}[];plan?:number[];name:string}
const batches=ref<{id:string;label:string;total:number;pending:number}[]>([])
const batch=ref<Batch|null>(null)
const folders=ref<Folder[]>([])
const label=ref('')
const keep=ref(false)
const groups=ref<DraftGroup[]>([{id:0,photos:[]}])
const nextGroup=ref(1)
const submitted=ref<Upload|null>(null)
const successful=ref(new Set<number>())
const totalDraft=computed(()=>groups.value.reduce((sum,group)=>sum+group.photos.length,0))
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
const anchor=(photo:ImportPhoto)=>photo.slot!=null ? photo.slot%5===0 : !batch.value?.paired || photo.side==='obverse'
const subjects=computed(()=>batch.value?.photos.filter(anchor) ?? [])
const uploading=computed(()=>!!batch.value?.expected_photos && !batch.value.cancelled &&
  batch.value.photos.filter(photo=>photo.state!=='uploading').length<batch.value.expected_photos)
const pending=computed(()=>subjects.value.filter(p=>['running','queued','uploading'].includes(p.state)).length)
const companions=(photo:ImportPhoto)=>photo.slot!=null
  ? (batch.value?.photos ?? []).filter(other=>other.id!==photo.id && other.slot!=null &&
    Math.floor(other.slot/5)===Math.floor(photo.slot!/5))
  : batch.value?.paired ? batch.value.photos.filter(other=>other.id!==photo.id) : []
const photoLabel=(index:number)=>['Front','Back'][index] ?? 'Detail'
const usable=(p:Photo)=>['manual','review','saved','failed'].includes(p.state)
const reviewable=(p:ImportPhoto)=>!p.record && usable(p) && !(batch.value?.expected_photos && p.state==='manual' && !p.error)
const cropPercent=(n:number)=>Math.round(n*100)
const rectStyle=computed(()=>({left:box.value.x*100+'%',top:box.value.y*100+'%',width:box.value.width*100+'%',height:box.value.height*100+'%'}))
const reverseOptions=computed(()=>batch.value?.photos.filter(p=>p.id!==current.value && usable(p)) ?? [])
const u=()=>new Date().toLocaleDateString()
onActivated(async()=>{
  poll.value=window.setInterval(()=>{if (batch.value && (pending.value || busy.value || uploading.value)) void refresh().catch(()=>{})},1800)
  try {
    await refreshList()
    folders.value=await request('/collections')
    await refresh()
  } catch(e){error.value=message(e)}
})
onDeactivated(()=>window.clearInterval(poll.value))
async function refreshList(){batches.value=await request('/imports')}
async function refresh(){if(batch.value) await open(batch.value.id,false)}
async function open(id:string,reset=true){
  if(reset){error.value='';current.value='';selected.value=[]}
  try {batch.value=await request('/imports/'+id)} catch(e){error.value=message(e)}
}
function choose(group:DraftGroup,event:Event){
  const input=event.target as HTMLInputElement
  const picked=Array.from(input.files ?? [])
  const room=Math.min(5-group.photos.length,20-totalDraft.value)
  group.photos.push(...picked.slice(0,room))
  if(picked.length>room) error.value='Each item can have up to five photos. A scan can have up to 20 photos.'
  input.value=''
}
function removeGroup(index:number) {
  groups.value.splice(index,1)
  if (!groups.value.length) groups.value.push({id:nextGroup.value++,photos:[]})
}
async function upload(analyze:boolean){
  if (busy.value) return
  busy.value=true;error.value='';notice.value=''
  try {
    if (!submitted.value) {
      const items=groups.value.filter(group=>group.photos.length)
      if (!items.length) return
      const slots:Upload['slots']=[]
      const fingerprints=new Set<string>()
      for(const [index,group] of items.entries()) {
        for(const [view,file] of group.photos.entries()) {
          const photo=await preparePhoto(file,keep.value)
          const bytes=await crypto.subtle.digest('SHA-256',await photo.arrayBuffer())
          const hash=Array.from(new Uint8Array(bytes)).join(',')
          if (fingerprints.has(hash)) throw new Error('The same photo is in two slots. Remove one copy before identifying.')
          fingerprints.add(hash)
          slots.push({name:file.name,photo,slot:analyze ? index*5+view : undefined})
        }
      }
      submitted.value={id:crypto.randomUUID(),slots,plan:analyze ? items.map(group=>group.photos.length) : undefined,
        name:label.value.trim() || (analyze ? 'Photo scan · ' : 'Photo import · ')+u()}
      successful.value.clear()
    }
    const entry=submitted.value
    done.value=successful.value.size;total.value=entry.slots.length
    const scan=!!entry.plan
    await request('/imports','POST',{id:entry.id,label:entry.name,analyze:scan,consent:scan,autoCatalog:scan,scanPlan:entry.plan})
    if (batch.value?.id!==entry.id) await open(entry.id)
    const remaining=entry.slots.map((value,index)=>({...value,index})).filter(value=>!successful.value.has(value.index))
    await Promise.all(Array.from({length:Math.min(3,remaining.length)},async()=>{
      for(let view=remaining.shift();view;view=remaining.shift()) {
        try {
          const query=view.slot===undefined ? '' : '?slot='+view.slot
          await request('/imports/'+entry.id+'/photos'+query,'PUT',view.photo)
          successful.value.add(view.index)
        }
        catch(e){error.value=view.name+' — '+message(e)}
        finally {done.value++}
      }
    }))
    const remainingCount=entry.slots.length-successful.value.size
    if (!remainingCount) {
      submitted.value=null
      groups.value=[{id:nextGroup.value++,photos:[]}]
    }
    notice.value=remainingCount ? remainingCount+' photos still need to upload.' : scan ? 'Identification started. You can scan another item.' : 'Photos uploaded.'
    await refresh();await refreshList()
  } catch(e){error.value=message(e)}
  finally{busy.value=false}
}
function review(photo:Photo,candidate?:Candidate){
  current.value=photo.id;side.value='obverse'
  const active=batch.value?.photos.find(p=>p.id===photo.id)
  reverse.value=active ? companions(active).find(p=>p.side==='reverse')?.id ?? '' : ''
  if(candidate){
    const {confidence:_confidence,crop:_crop,model:_model,referenceMatches:_references,...fields}=candidate
    form.value={...emptyItem(),...fields,typeLocked:true,details:fields.details ?? {},collection_id:folders.value[0]?.id ?? null}
  } else {
    const type=active?.candidates[0]?.type ?? 'coin'
    form.value={...emptyItem(),type,typeLocked:!!active?.candidates.length && active.candidates.every(p=>p.type===type),
      title:active?.slot!=null ? 'Unidentified '+type : '',collection_id:folders.value[0]?.id ?? null}
  }
  references.value=candidate?.referenceMatches ?? []
  box.value=candidate?.crop ? {...candidate.crop}:{x:0,y:0,width:1,height:1}
  void document.querySelector('#review')?.scrollIntoView({block:'start'})
}
async function action(fn:()=>Promise<unknown>){
  try{error.value='';await fn();await refresh();await refreshList()}catch(e){error.value=message(e)}
}
async function save(){
  const photo=batch.value?.photos.find(p=>p.id===current.value)
  const grouped=photo && (photo.slot!=null || batch.value?.paired)
  const links:Link[]=grouped
    ? [photo,...companions(photo)].map(photo=>({photoId:photo.id,side:photo.side ?? 'overview',crop:photo.id===current.value ? box.value : null}))
    : [{photoId:current.value,side:side.value,crop:box.value}]
  if(reverse.value && !grouped) links.push({photoId:reverse.value,side:side.value==='reverse'?'obverse':'reverse'})
  await action(async()=>{
    await request(photo?.slot==null ? '/items' : '/photos/'+photo.id+'/save','POST',cleanItem({...form.value,photos:links}))
    current.value='';notice.value='Specimen added to your collection.'
  })
}
const bulkPhoto=(photo:ImportPhoto) => photo.slot==null && !batch.value?.paired && photo.state==='review' && photo.candidates.length===1
const structured=computed(()=>batch.value?.paired || batch.value?.photos.find(photo=>photo.id===current.value)?.slot!=null)
function status(photo:ImportPhoto) {
  if (photo.record || photo.state==='saved') return 'Saved'
  if (photo.state==='running') return photo.scan?.stage==='references' ? 'Checking references' : 'Reading photos'
  if (photo.state==='queued') return 'Waiting to identify'
  if (photo.state==='review') return photo.candidates.length || photo.scan?.leads.length ? 'Review possible matches' : 'Needs another look'
  if (photo.state==='failed') return 'Identification interrupted'
  if (photo.state==='manual' && uploading.value) return 'Waiting for photos'
  return photo.state
}
async function bulk(){
  if(!batch.value)return
  const eligible=batch.value.photos.filter(p=>selected.value.includes(p.id) && bulkPhoto(p))
  await action(async()=>{
    for(let i=0;i<eligible.length;i+=20) {
      const chunk=eligible.slice(i,i+20)
      await request('/items/bulk','POST',chunk.map(p=>({...p.candidates[0],typeLocked:true,collection_id:folders.value[0]?.id ?? null,
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
    <h2>Scan coins and banknotes</h2>
    <label>Batch label<input v-model="label" :disabled="!!submitted || busy" placeholder="e.g. Second tray"></label>
    <fieldset v-for="(group,index) in groups" :key="group.id" :disabled="!!submitted || busy">
      <legend>{{groups.length===1 ? 'One item' : 'Item '+(index+1)}}</legend>
      <div class="form-grid">
        <label>Photo library<input :aria-label="groups.length===1 ? 'Photo library' : 'Photo library for item '+(index+1)"
          type="file" accept="image/*,.heic,.heif" multiple :disabled="group.photos.length>=5 || totalDraft>=20" @change="choose(group,$event)"></label>
        <label>Camera<input :aria-label="groups.length===1 ? 'Camera' : 'Camera for item '+(index+1)"
          type="file" accept="image/*" capture="environment" :disabled="group.photos.length>=5 || totalDraft>=20" @change="choose(group,$event)"></label>
      </div>
      <ol v-if="group.photos.length">
        <li v-for="(file,view) in group.photos" :key="view">
          {{photoLabel(view)}} · {{file.name}}
          <button type="button" @click="group.photos.splice(view,1)" :aria-label="'Remove '+photoLabel(view)+' photo'">Remove</button>
        </li>
      </ol>
      <button v-if="groups.length>1" type="button" @click="removeGroup(index)">Remove item</button>
    </fieldset>
    <p>Keep both sides together. Use even light and include the full item before adding a close-up.</p>
    <label class="check"><input type="checkbox" v-model="keep" :disabled="!!submitted || busy">Keep compatible originals up to 6 MB.</label>
    <div class="actions">
      <template v-if="!submitted">
        <button class="primary" :disabled="!totalDraft || busy" @click="upload(true)">Identify {{groups.filter(group=>group.photos.length).length || 1}} {{groups.filter(group=>group.photos.length).length>1 ? 'items' : 'item'}}</button>
        <button :disabled="!groups.at(-1)?.photos.length || totalDraft>=20 || busy" @click="groups.push({id:nextGroup++,photos:[]})">Add another item</button>
        <button :disabled="!totalDraft || busy" @click="upload(false)">Upload without identification</button>
      </template>
      <button v-else :disabled="busy" @click="upload(!!submitted?.plan)">Resume upload</button>
    </div>
    <p class="muted">Identify sends the photos to NumiAgent for AI processing and saves clear matches. External image search is controlled in Settings.</p>
    <p v-if="busy && !submitted" role="status">Preparing photos…</p>
    <label v-if="busy && submitted">Upload attempts {{done}} of {{total}}<progress :value="done" :max="total"></progress></label>
  </section>
  <label v-if="batches.length">Open an import<select :value="batch?.id || ''" :disabled="busy" @change="open(($event.target as HTMLSelectElement).value)"><option value="" disabled>Select a batch</option><option v-for="b in batches" :key="b.id" :value="b.id">{{b.label}} ({{b.total}})</option></select></label>
  <section v-if="batch" class="panel">
    <div class="section-heading"><div><h2>{{batch.label}}</h2><p>{{uploading ? 'Waiting for the remaining photos' : pending ? pending+' items processing' : 'Ready to review'}}</p></div>
      <button v-if="!batch.cancelled && (pending || uploading)" :disabled="busy" @click="action(()=>request('/imports/'+batch!.id+'/cancel','POST'))">Cancel pending work</button></div>
    <button v-if="selected.length" class="primary" @click="bulk">Save {{selected.length}} reviewed candidates</button>
    <div class="photo-grid">
      <article class="photo-card" v-for="(p,index) in subjects" :key="p.id">
        <div class="scan-views">
          <figure v-for="(view,position) in [p,...companions(p)]" :key="view.id">
            <PhotoViewer v-if="view.state!=='uploading'" :src="photoURL(view.id)" :label="photoLabel(position)+' of item '+(index+1)">
              <img loading="lazy" :src="photoURL(view.id)" :alt="photoLabel(position)+' of item '+(index+1)">
            </PhotoViewer>
            <figcaption v-if="p.slot!=null || batch.paired">{{photoLabel(position)}}</figcaption>
          </figure>
        </div>
        <div><span class="status">{{status(p)}}</span><small v-if="p.error">{{p.error}}</small>
          <button v-if="p.record" @click="$emit('specimen',p.record.id)">Open {{p.record.title}}</button>
          <p v-if="p.state==='review' && p.scan?.next">{{p.scan.next}}</p>
          <small v-if="Object.values(p.scan?.providers ?? {}).includes('unavailable')">Some reference sources were unavailable. Any results found are shown here.</small>
          <button v-if="p.state==='failed' && (!batch.paired || p.side==='obverse')" @click="action(()=>request('/photos/'+p.id+'/retry','POST'))">Retry analysis</button>
          <template v-if="reviewable(p)">
            <button v-for="(candidate,i) in p.candidates" :key="i" @click="review(p,candidate)">{{candidate.title}}</button>
            <button @click="review(p)">{{p.slot==null ? 'Catalog manually' : 'Save as unidentified'}}</button>
            <label class="check" v-if="bulkPhoto(p)"><input v-model="selected" type="checkbox" :value="p.id">Approve candidate</label>
          </template>
          <ul v-if="p.scan?.leads.length" class="record-list" aria-label="Possible references">
            <li v-for="lead in p.scan.leads" :key="lead.source">
              <a :href="lead.source" target="_blank" rel="noopener noreferrer">{{lead.label}} ↗</a>
              <small>{{lead.attribution}} · Possible reference</small>
              <p v-if="lead.obverse || lead.reverse">{{[lead.obverse,lead.reverse].filter(Boolean).join(' / ')}}</p>
              <p v-if="lead.excerpt">{{lead.excerpt}}</p>
              <small v-if="lead.supports?.length">Shared details · {{lead.supports.join(', ')}}</small>
              <small v-if="lead.conflicts?.length">Check this difference · {{lead.conflicts.join('; ')}}</small>
            </li>
          </ul>
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
      <PhotoViewer :src="photoURL(current)" label="Original photo">
        <div class="crop-frame"><img :src="photoURL(current)" alt="Original photo and indicated crop"><div :style="rectStyle"></div></div>
      </PhotoViewer>
      <form @submit.prevent="save">
        <fieldset><legend>Crop (% of the original photo)</legend><div class="form-grid">
          <label v-for="key in (['x','y','width','height'] as const)" :key="key">{{key}}
            <input type="number" min="0" max="100" required :value="cropPercent(box[key])" @input="box[key]=Number(($event.target as HTMLInputElement).value)/100">
          </label>
        </div></fieldset>
        <div class="form-grid" v-if="!structured">
          <label>Photo side<select v-model="side"><option value="obverse">Obverse</option><option value="reverse">Reverse</option><option value="overview">Overview</option></select></label>
          <label>Pair with another photo<select v-model="reverse"><option value="">No pairing</option><option v-for="other in reverseOptions" :key="other.id" :value="other.id">Photo {{(batch?.photos.findIndex(p=>p.id===other.id) ?? 0)+1}} · {{other.candidates[0]?.title ?? other.state}}</option></select></label>
        </div>
        <PhotoViewer v-if="reverse" :src="photoURL(reverse)" label="Paired photograph"><img class="pair-preview" :src="photoURL(reverse)" alt="Paired photograph"></PhotoViewer>
        <ItemFields v-model="form" :folders="folders"/>
        <button class="primary">Save specimen</button>
        <button type="button" @click="current=''">Close review</button>
      </form>
    </template>
    <p v-else>Open a processed photo to review an identification, adjust the crop, or pair two sides.</p>
  </section>
</template>

<style scoped>
.scan-views { display:grid; grid-template-columns:repeat(auto-fit,minmax(5rem,1fr)); gap:.5rem }
.scan-views figure { margin:0 }
.scan-views img { width:100%; aspect-ratio:1; object-fit:contain }
</style>
