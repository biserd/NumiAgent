<script setup lang="ts">
import { computed, ref } from 'vue'
const selected = ref(0)
const steps = [
  {label:'Capture',title:'A tray at a time.',description:'Shoot both sides on your phone or add a full batch from your photo library. Watch the import progress and come back to the same batch to resume.',sample:'Front and back retained together',value:'Bulk photo import'},
  {label:'Identify',title:'Read the details that matter.',description:'Review suggested issuers, dates, denominations, inscriptions, and references. Correct the crop or attribution before adding a specimen to your collection.',sample:'Candidate attribution · Review required',value:'Ancient bronze coin'},
  {label:'Value',title:'See the sales behind the estimate.',description:'Keep realized auction prices, dates, and original lot links. When comparable evidence is thin, the ledger shows the gap.',sample:'Realized prices and original lot links',value:'Comparable-sale evidence'},
  {label:'Complete',title:'See what’s missing.',description:'Start with a reference-backed Roman emperor checklist or define a goal of your own. Search approved marketplaces for missing pieces.',sample:'Reference-backed checklist',value:'First-century Roman emperors'}
]
const step = computed(()=>steps[selected.value])
</script>
<template>
  <div class="public-page">
    <header class="site-header wrap"><a class="brand" href="/"><img src="/mark.svg" alt="" width="36" height="36">Numis<span>Vault</span></a>
      <nav aria-label="Main"><a href="#workflow">How it works</a><a href="#features">Features</a><a class="header-button" href="/app">Sign in <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main>
      <section class="hero wrap">
        <div class="hero-copy"><p class="eyebrow">THE PRIVATE NUMISMATIC CATALOG</p><h1>Every piece<br>has a <em>story.</em></h1>
          <p class="hero-description">Photograph your coins and banknotes, identify what you own, and find the pieces you’re missing.</p>
          <div class="hero-actions"><a class="button gold" href="/app">Start your collection <span aria-hidden="true">↗</span></a><a href="#workflow" class="text-link">See how it works ↓</a></div>
        </div>
        <figure class="hero-art"><img src="/roman-bronze.jpg" alt="Illustration of a weathered Roman bronze coin" width="1100" height="1100" fetchpriority="high">
          <figcaption><span>ROMAN BRONZE</span><span>ILLUSTRATED SPECIMEN</span></figcaption></figure>
      </section>
      <section class="workflow" id="workflow"><div class="wrap">
        <p class="eyebrow">THE WORKFLOW</p><h2>From photograph<br>to collection.</h2>
        <div class="step-tabs" aria-label="Preview the workflow"><button v-for="(s,index) in steps" :key="s.label" :aria-pressed="selected===index" @click="selected=index">{{ s.label }}</button></div>
        <div class="step-preview"><div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div>
          <div class="preview-card"><img src="/roman-bronze.jpg" alt="" width="110" height="110" loading="lazy"><div><small>ILLUSTRATIVE PREVIEW</small><strong>{{ step.value }}</strong><span>{{ step.sample }}</span></div></div>
        </div>
      </div></section>
      <section class="features wrap" id="features">
        <article><h3>Built for big batches.</h3><p>Upload tray photos or hundreds of individual shots. Review candidates, pair obverse and reverse images, and keep your photographs private.</p></article>
        <article><h3>Grounded in sale records.</h3><p>Trace each comparable to its original auction lot. Keep recorded hammer prices and buyer’s premiums distinct.</p></article>
        <article><h3>Collect with a goal.</h3><p>Track a series or ruler checklist. Search for gaps, save queries, and follow available matches back to the auction house.</p></article>
      </section>
    </main>
    <footer class="site-header wrap"><a class="brand" href="/"><img src="/mark.svg" alt="" width="32" height="32">Numis<span>Vault</span></a><a href="/app">Open the catalog ↗</a></footer>
  </div>
</template>
