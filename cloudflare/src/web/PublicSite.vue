<script setup lang="ts">
import Landing from './Landing.vue'
import PublicPage from './PublicPage.vue'
import LaunchEmail from './LaunchEmail.vue'
import { launchEmailPath } from './launch'
import { sitePages } from './sitePages'

defineProps<{path:string;appStoreAvailable:boolean}>()
</script>

<template>
  <Landing v-if="path==='/'" :app-store-available="appStoreAvailable"/>
  <LaunchEmail v-else-if="path===launchEmailPath"/>
  <PublicPage v-else :path="path" :page="sitePages[path]" :app-store-available="appStoreAvailable"/>
</template>
