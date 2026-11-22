<script setup lang="ts">
import { appStoreUrl } from './launch'
defineProps<{available:boolean;home?:boolean}>()
</script>

<template>
  <div class="hero-actions">
    <a v-if="available" class="button gold" :href="appStoreUrl" data-marketing-event="app_store_click">Download on the App Store</a>
    <a v-else class="button gold" :href="home?'#launch':'/#launch'">Notify me at launch</a>
    <a href="/app" class="text-link" data-marketing-event="web_catalog_click">Open web catalog <span aria-hidden="true">↗</span></a>
  </div>
</template>
