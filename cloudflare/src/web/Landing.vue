<script setup lang="ts">
import { computed, ref } from 'vue'
import SiteNav from './SiteNav.vue'
const selected = ref(0)
const steps = [
  {label:'Capture',problem:'Too many photos to sort?',benefit:'Upload a whole tray at once and keep the two sides of each piece together.',
    title:'Get the tray out of your camera roll.',description:'Import a batch from your phone, review the photos as they come in, and return to the same batch later. Add the results to a private catalog you can search.',
    sample:'Front and back retained together',value:'Bulk photo import'},
  {label:'Identify',problem:'Stuck on an unfamiliar piece?',benefit:'Get AI suggestions for coins and banknotes, then confirm the details yourself.',
    title:'Give a mystery piece a place to start.',description:'Use suggested issuers, inscriptions, and references to guide your research. See how confident the suggestion is, correct the crop or attribution, and save the details you can verify.',
    sample:'Candidate attribution · Review required',value:'Ancient bronze coin'},
  {label:'Value',problem:'Unsure what it’s worth?',benefit:'Compare actual sales and keep the link to each auction lot.',
    title:'See what buyers actually paid.',description:'Record comparable auction sales with their dates, currencies, and buyer’s premiums. See a range when the evidence supports it and know when you need more sales to compare.',
    sample:'Realized prices and original lot links',value:'Comparable-sale evidence'},
  {label:'Complete',problem:'What’s still missing?',benefit:'See the gaps in a set and save searches for the pieces you want next.',
    title:'Know what to look for next.',description:'Start with a Roman emperor checklist or build your own. Match it against the pieces you already own and keep the remaining targets in one place.',
    sample:'Reference-backed checklist',value:'First-century Roman emperors'}
]
const step = computed(()=>steps[selected.value])
</script>
<template>
  <div class="public-page">
    <SiteNav landing/>
    <main>
      <section class="hero wrap">
        <div class="hero-copy"><h1>Know what’s<br>in your <em>collection.</em></h1>
          <p class="hero-description">Turn a camera roll full of coins and banknotes into a private catalog. Identify unfamiliar pieces, compare actual auction prices, and see what’s missing from your sets.</p>
          <div class="hero-actions"><a class="button gold" href="/app">Start cataloging <span aria-hidden="true">↗</span></a><a href="#workflow" class="text-link">See how it works ↓</a></div>
        </div>
        <figure class="hero-art"><img src="/roman-bronze.jpg" alt="Illustration of a weathered Roman bronze coin" width="1100" height="1100" fetchpriority="high">
          <figcaption><span>ROMAN BRONZE</span><span>ILLUSTRATED SPECIMEN</span></figcaption></figure>
      </section>
      <section class="workflow" id="workflow"><div class="wrap">
        <h2>From the tray to your next find.</h2>
        <div class="step-tabs" aria-label="Preview the workflow"><button v-for="(s,index) in steps" :key="s.label" :aria-pressed="selected===index" @click="selected=index">{{ s.label }}</button></div>
        <div class="step-preview"><div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div>
          <div class="preview-card"><img src="/roman-bronze.jpg" alt="" width="110" height="110" loading="lazy"><div><small>ILLUSTRATIVE PREVIEW</small><strong>{{ step.value }}</strong><span>{{ step.sample }}</span></div></div>
        </div>
      </div></section>
      <section class="features wrap" id="features" aria-label="Common collecting problems">
        <article v-for="item in steps" :key="item.label"><h3>{{item.problem}}</h3><p>{{item.benefit}}</p></article>
      </section>
    </main>
    <SiteNav footer path="/"/>
  </div>
</template>
