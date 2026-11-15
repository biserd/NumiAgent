<script setup lang="ts">
import { developerLinks, type SitePage } from './sitePages'
import SiteNav from './SiteNav.vue'
import ContactForm from './ContactForm.vue'
defineProps<{page:SitePage;path:string}>()
</script>
<template>
  <div class="public-page">
    <SiteNav/>
    <main class="information">
      <div class="information-header wrap">
        <nav v-if="path==='/developers' || path.startsWith('/developers/')" class="developer-nav" aria-label="Developer documentation">
          <a v-for="link in developerLinks" :key="link.href" :href="link.href" :aria-current="path===link.href?'page':undefined">{{link.label}}</a>
        </nav>
        <h1>{{page.title}}</h1>
        <p>{{page.description}}</p>
        <small v-if="page.effective">Effective {{page.effective}}</small>
      </div>
      <div class="information-content wrap">
        <section v-for="section in page.sections" :key="section.title">
          <h2>{{section.title}}</h2>
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{paragraph}}</p>
          <pre v-if="section.code" class="docs-code" tabindex="0"><code>{{section.code}}</code></pre>
          <div v-if="section.links?.length" class="information-links">
            <a v-for="link in section.links" :key="link.href" :href="link.href">{{link.label}} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <ContactForm v-if="path==='/contact'"/>
      </div>
    </main>
    <SiteNav footer/>
  </div>
</template>
