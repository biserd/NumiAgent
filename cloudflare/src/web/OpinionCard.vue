<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Specimen } from './api'
import { cardDetails, type CardValuation } from './cardDetails'
import { cardQuestions, cardStyles, customCardFrame, drawOpinionCard, loadCardPhotos, suggestedStyle, type CardStyle } from './opinionCard'

const props=defineProps<{piece:Specimen;valuation:CardValuation|null}>()
const stats=computed(()=>cardDetails(props.piece,props.valuation))
const includePaid=ref(false)
const description=computed(()=>{
  const {facts,inscriptions,price,paid}=stats.value
  return ['Tentative identification: '+props.piece.title,...[...inscriptions,...facts].map(f=>f.label+' '+f.value),
    price && [price.label,price.amount,price.source].join(' '),includePaid.value && paid && 'Purchase price '+paid,question.value].filter(Boolean).join('. ')
})
const open=ref(false)
const style=ref<CardStyle>(suggestedStyle(props.piece))
const questions=computed(()=>cardQuestions(props.piece.type))
const question=ref(questions.value[0])
const url=ref('')
const file=shallowRef<File>()
const error=ref('')
const retry=ref(0)
const artwork=shallowRef<HTMLImageElement>()
const generating=ref(false)
let generation:AbortController|undefined
let photoKey=''
let loaded:ReturnType<typeof loadCardPhotos>|undefined

function clear() {
  if(url.value) URL.revokeObjectURL(url.value)
  url.value=''
  file.value=undefined
}
function resetArtwork() {
  generation?.abort()
  generation=undefined
  generating.value=false
  artwork.value=undefined
}
onBeforeUnmount(()=>{resetArtwork();clear()})
watch([open,style,()=>props.piece],resetArtwork)
async function generate(){
  if(!loaded || generating.value) return
  const controller=new AbortController()
  generation=controller
  generating.value=true
  error.value=''
  try{
    const image=await customCardFrame(await loaded,style.value,controller.signal)
    if(!controller.signal.aborted) artwork.value=image
  }catch(e){ if(!controller.signal.aborted) error.value=e instanceof Error?e.message:'A custom frame could not be created.' }
  finally{ if(generation===controller){generating.value=false;generation=undefined} }
}
watch([open,style,question,retry,artwork,stats,includePaid,()=>props.piece],async(_,__,onCleanup)=>{
  let current=true
  onCleanup(()=>{current=false})
  clear()
  error.value=''
  if(!open.value){ loaded=undefined;includePaid.value=false;return }
  const piece=props.piece
  const links=piece.photos?.length ? piece.photos : piece.photo ? [{photoId:piece.photo,side:'overview' as const}] : []
  const key=JSON.stringify(links)
  if(!loaded || photoKey!==key) {
    photoKey=key
    loaded=loadCardPhotos(links)
  }
  try {
    const photos=await loaded
    if(!current) return
    const rendered=await drawOpinionCard(piece,photos,style.value,question.value,stats.value,includePaid.value,artwork.value)
    if(!current) return
    file.value=rendered
    url.value=URL.createObjectURL(rendered)
  } catch {
    if(current){ loaded=undefined; error.value='The card could not be prepared. Check that the photos are available and try again.' }
  }
})
const canShare=computed(()=>!!file.value && navigator.canShare?.({files:[file.value]}))
async function share(){
  if(!file.value) return
  try{ await navigator.share({files:[file.value]}) }
  catch(e){ if(!(e instanceof DOMException && e.name==='AbortError')) error.value='Sharing is unavailable here. Download the PNG to send it.' }
}
</script>
<template>
  <details @toggle="open=($event.currentTarget as HTMLDetailsElement).open">
    <summary>Ask for a second opinion</summary>
    <section v-if="open" class="opinion-composer" aria-label="Second opinion card">
      <img v-if="url" :src="url" :alt="description" class="opinion-preview">
      <p v-else-if="!error" role="status">Preparing your card…</p>
      <label>Card style<select v-model="style"><option v-for="(_,name) in cardStyles" :key="name">{{name}}</option></select></label>
      <label>Ask the collector<select v-model="question"><option v-for="q in questions" :key="q">{{q}}</option></select></label>
      <label v-if="stats.paid"><input type="checkbox" v-model="includePaid"> Include my purchase price</label>
      <div v-if="url" class="actions">
        <button type="button" :disabled="generating" @click="generate">{{generating?'Generating frame…':'Generate custom frame'}}</button>
        <button v-if="artwork" type="button" @click="resetArtwork">Use original frame</button>
      </div>
      <small>Custom frames send the style and one sampled color per photo to Cloudflare Workers AI. Your photos stay in the browser during card generation.</small>
      <p>Send this image to a friend or coin club. Check the photos for visible serial numbers or personal details.</p>
      <div class="actions" v-if="url">
        <button v-if="canShare" class="primary" type="button" @click="share">Share card</button>
        <a :href="url" download="NumiAgent-second-opinion.png">Download card as PNG</a>
      </div>
      <p v-if="error" role="alert">{{error}} <button v-if="!url" type="button" @click="retry++">Try again</button></p>
    </section>
  </details>
</template>
<style scoped>
.opinion-composer{display:grid;gap:12px;max-width:36rem;margin:1rem auto}
.opinion-preview{display:block;width:min(100%,26rem);height:auto;margin:auto}
.opinion-composer p{margin:0}
.opinion-composer a{font-weight:650;text-decoration:underline}
</style>
