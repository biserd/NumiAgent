<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
defineProps<{src:string;label:string}>()
const dialog=ref<HTMLDialogElement>()
const viewport=ref<HTMLElement>()
const photo=ref<HTMLImageElement>()
const trigger=ref<HTMLButtonElement>()
const opened=ref(false)
const scale=ref(1), x=ref(0), y=ref(0)
type Point={x:number;y:number}
const pointers=new Map<number,Point>()
let start:Point|undefined, tap:Point|undefined, tapTime=0, moved=false
let resize:ResizeObserver|undefined
function fit(){scale.value=1;x.value=0;y.value=0}
function clamp(){
  const area=viewport.value, img=photo.value
  if(!area || !img?.naturalWidth) return
  const fitScale=Math.min(area.clientWidth/img.naturalWidth,area.clientHeight/img.naturalHeight)
  const dx=Math.max(0,(img.naturalWidth*fitScale*scale.value-area.clientWidth)/2)
  const dy=Math.max(0,(img.naturalHeight*fitScale*scale.value-area.clientHeight)/2)
  x.value=Math.max(-dx,Math.min(dx,x.value));y.value=Math.max(-dy,Math.min(dy,y.value))
}
function zoom(target:number,from:Point={x:0,y:0},to=from){
  const value=Math.max(1,Math.min(8,target)), ratio=value/scale.value
  x.value=to.x+(x.value-from.x)*ratio;y.value=to.y+(y.value-from.y)*ratio
  scale.value=value;clamp()
}
function point(e:PointerEvent){
  const box=viewport.value!.getBoundingClientRect()
  return {x:e.clientX-box.left-box.width/2,y:e.clientY-box.top-box.height/2}
}
function down(e:PointerEvent){
  if(e.button!==0 || pointers.size>=2) return
  const p=point(e)
  viewport.value?.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId,p)
  if(pointers.size===1){start=p;moved=false}else{moved=true;tap=undefined}
}
const middle=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
function move(e:PointerEvent){
  const old=pointers.get(e.pointerId)
  if(!old) return
  const current=point(e),other=[...pointers].find(([id])=>id!==e.pointerId)?.[1]
  if(other && distance(old,other)>1) zoom(scale.value*distance(current,other)/distance(old,other),middle(old,other),middle(current,other))
  else {x.value+=current.x-old.x;y.value+=current.y-old.y;clamp()}
  if(start && distance(start,current)>8) moved=true
  pointers.set(e.pointerId,current)
}
function up(e:PointerEvent){
  if(!pointers.delete(e.pointerId))return
  if(e.type==='pointercancel'){moved=true;tap=undefined;return}
  if(moved || pointers.size) return
  const p=point(e), now=performance.now()
  if(tap && now-tapTime<350 && distance(p,tap)<28){zoom(scale.value>1?1:3,p);tap=undefined}
  else{tap=p;tapTime=now}
}
async function show(){
  fit();opened.value=true;await nextTick();dialog.value?.showModal()
  if(viewport.value){resize=new ResizeObserver(clamp);resize.observe(viewport.value)}
}
function close(){resize?.disconnect();pointers.clear();tap=undefined;opened.value=false;trigger.value?.focus()}
onBeforeUnmount(()=>resize?.disconnect())
</script>
<template>
  <button ref="trigger" type="button" class="photo-open" :aria-label="'Zoom '+label" @click="show"><slot/><span aria-hidden="true" class="zoom-mark">⤢</span></button>
  <Teleport to="body"><dialog v-if="opened" ref="dialog" class="photo-dialog" :aria-label="label" @close="close">
    <header><strong>{{label}}</strong><button type="button" autofocus @click="dialog?.close()">Done</button></header>
    <div ref="viewport" class="photo-surface" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
      <img ref="photo" :src="src" :alt="label" draggable="false" :style="{transform:'translate('+x+'px,'+y+'px) scale('+scale+')'}" @load="clamp">
    </div>
    <footer><button type="button" aria-label="Zoom out" :disabled="scale<=1" @click="zoom(scale/2)">−</button>
      <button type="button" @click="fit">Fit</button><output>{{Math.round(scale*100)}}%</output>
      <button type="button" aria-label="Zoom in" :disabled="scale>=8" @click="zoom(scale*2)">+</button></footer>
  </dialog></Teleport>
</template>
<style scoped>
.photo-open{position:relative;display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in;overflow:hidden}
.zoom-mark{position:absolute;right:.4rem;bottom:.4rem;background:#fff;color:#173c31;border-radius:50%;width:2rem;height:2rem;display:grid;place-items:center;font-size:1.35rem}
.photo-dialog[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(96vw,1100px);height:90dvh;max-width:100%;max-height:100%;margin:auto;padding:0;border:0;background:#141815;color:white;border-radius:12px}
.photo-dialog::backdrop{background:#101612d9}.photo-dialog header,.photo-dialog footer{display:flex;align-items:center;gap:12px;padding:10px 16px}.photo-dialog header{justify-content:space-between}.photo-dialog footer{justify-content:center}
.photo-dialog button{min-height:44px;min-width:44px}.photo-dialog output{min-width:4ch;text-align:center}
.photo-surface{position:relative;overflow:hidden;touch-action:none;user-select:none;cursor:grab}.photo-surface:active{cursor:grabbing}
.photo-surface img{display:block;width:100%;height:100%;max-width:none;max-height:none;object-fit:contain;pointer-events:none}
</style>
