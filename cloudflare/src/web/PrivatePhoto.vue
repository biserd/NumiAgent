<script setup lang="ts">
import { computed, ref } from 'vue'
import { photoURL } from './api'
import type { Box } from './api'
const props = defineProps<{id:string;description:string;crop?:Box|null}>()
const size = ref<{width:number;height:number}|null>(null)
const frame = computed(()=>{
  if(!size.value || !props.crop) return undefined
  return {aspectRatio:(size.value.width*props.crop.width)+' / '+(size.value.height*props.crop.height)}
})
const image = computed(()=>{
  const box = props.crop
  if(!frame.value || !box) return undefined
  return {width:100/box.width+'%',height:100/box.height+'%',left:(-box.x/box.width)*100+'%',top:(-box.y/box.height)*100+'%'}
})
function dimensions(event:Event) {
  const photo = event.target as HTMLImageElement
  size.value = {width:photo.naturalWidth,height:photo.naturalHeight}
}
</script>
<template>
  <div :class="{ 'private-photo':true, cropped:!!frame }" :style="frame">
    <img loading="lazy" :src="photoURL(id)" :alt="description" :style="image" @load="dimensions">
  </div>
</template>
<style scoped>
.private-photo{background:#eee8dc}
.private-photo img{width:100%;height:auto;max-height: none;object-fit:contain}
.cropped{position:relative;overflow:hidden}
.cropped img{position:absolute;max-width:none;max-height:none;object-fit:fill}
</style>
