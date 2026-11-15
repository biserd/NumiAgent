<script setup lang="ts">
import { siteLinks } from './sitePages'
import { blogPosts } from './blogPosts'
defineProps<{footer?:boolean;landing?:boolean;path?:string}>()
</script>
<template>
  <footer v-if="footer" class="site-footer wrap">
    <a class="brand" href="/"><img src="/mark.svg" alt="" width="32" height="32">Numi<span>Agent</span></a>
    <nav aria-label="Site information">
      <a v-for="page in siteLinks" :key="page.href" :href="page.href" :aria-current="path===page.href?'page':undefined">{{page.label}}</a>
    </nav>
    <nav class="footer-guides" aria-label="Collector guides">
      <a v-for="post in blogPosts" :key="post.path" :href="post.path" :aria-current="path===post.path?'page':undefined">{{post.guideLabel}}</a>
    </nav>
  </footer>
  <header v-else class="site-header wrap">
    <a class="brand" href="/"><img src="/mark.svg" alt="" width="36" height="36">Numi<span>Agent</span></a>
    <nav aria-label="Main">
      <a :href="landing?'#workflow':'/#workflow'">How it works</a>
      <a class="nav-features" href="/features">Features</a>
      <a class="nav-blog" href="/blog">Blog</a>
      <a href="/about">About</a>
      <a href="/developers">Developers</a>
      <a class="header-button" href="/app">Sign in <span aria-hidden="true">↗</span></a>
    </nav>
  </header>
</template>
