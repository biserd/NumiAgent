<script setup lang="ts">
import type { SitePage } from './sitePages'
import SiteNav from './SiteNav.vue'
import ContactForm from './ContactForm.vue'
defineProps<{page:SitePage;contact:boolean}>()
</script>
<template>
  <div class="public-page">
    <SiteNav/>
    <main class="information">
      <div class="information-header wrap">
        <h1>{{page.title}}</h1>
        <p>{{page.description}}</p>
        <small v-if="page.effective">Effective {{page.effective}}</small>
      </div>
      <div class="information-content wrap">
        <section v-for="section in page.sections" :key="section.title">
          <h2>{{section.title}}</h2>
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{paragraph}}</p>
          <div v-if="section.links?.length" class="information-links">
            <a v-for="link in section.links" :key="link.href" :href="link.href">{{link.label}} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <ContactForm v-if="contact"/>
      </div>
    </main>
    <SiteNav footer/>
  </div>
</template>
