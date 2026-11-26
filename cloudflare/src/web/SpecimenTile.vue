<script setup lang="ts">
import { photoURL, type Specimen } from './api'
defineProps<{item:Specimen}>()
defineEmits<{open:[]}>()
</script>
<template>
  <button class="specimen-button" type="button" @click="$emit('open')">
    <img v-if="item.photo" loading="lazy" :src="photoURL(item.photo)" alt="">
    <span v-else class="no-photo" aria-hidden="true">{{item.type==='coin'?'◉':'▤'}}</span>
    <span class="specimen-label"><strong>{{item.title}}</strong><small>{{[item.issuer,item.year,item.reference].filter(Boolean).join(' · ') || item.type}}</small></span>
  </button>
</template>
<style>
.collection-results.grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,clamp(135px,21vw,210px)),1fr))}
.collection-results.grid .specimen-button img,.collection-results.grid .specimen-button .no-photo{height:auto;aspect-ratio:1.35}
</style>
