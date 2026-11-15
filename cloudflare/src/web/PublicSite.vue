<script setup lang="ts">
import Landing from './Landing.vue'
import PublicPage from './PublicPage.vue'
import { sitePages } from './sitePages'

defineProps<{path:string}>()
</script>

<template>
  <Landing v-if="path==='/'"/>
  <PublicPage v-else :path="path" :page="sitePages[path]"/>
</template>
