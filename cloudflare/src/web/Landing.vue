<script setup lang="ts">
import { computed, ref } from 'vue'
import SiteNav from './SiteNav.vue'
const selected = ref(0)
const steps = [
  {label:'Capture',problem:'Too many photos to sort?',benefit:'Keep both sides together and pick up unfinished pieces when you reopen the app.',
    title:'Get the tray out of your camera roll.',description:'Start scanning on iPhone or iPad without signing in. Photograph or import both sides of a coin or banknote and save it to a searchable collection on your device.'},
  {label:'Identify',problem:'Stuck on an unfamiliar piece?',benefit:'Review on-device suggestions or choose photos for an online search.',
    title:'Find a starting point for a mystery piece.',description:'Review likely or possible matches and correct the details before you save. If the piece needs more research, choose exactly which photos to send for an online search.'},
  {label:'Value',problem:'Unsure what it’s worth?',benefit:'Compare actual sales and keep the link to each auction lot.',
    title:'See what buyers actually paid.',description:'In your web account, record comparable auction sales with dates, currencies, and buyer’s premiums. See a range when the evidence supports it.'},
  {label:'Complete',problem:'What’s still missing?',benefit:'See the gaps in a set and save searches for the pieces you want next.',
    title:'Know what to look for next.',description:'Use the web account to start with a sourced checklist or build your own. Match it against the pieces in your online collection and see which ones you still need.'}
]
const step = computed(()=>steps[selected.value])
</script>
<template>
  <div class="public-page">
    <SiteNav landing/>
    <main>
      <section class="hero wrap">
        <div class="hero-copy"><h1>Your collection.<br><em>Yours to keep.</em></h1>
          <p class="hero-description">Scan both sides of your coins and banknotes. Review matches and build a searchable collection on your iPhone or iPad, even offline and without an email.</p>
          <div class="hero-actions"><a class="button gold" href="#workflow">Explore the iPhone &amp; iPad workflow <span aria-hidden="true">↓</span></a><a href="/app" class="text-link">Open web account ↗</a></div>
        </div>
        <figure class="hero-art collection-hero"><img src="/collection-hero.jpg" alt="Two worn coins and an illustrated banknote in an archival tray" width="1280" height="853" fetchpriority="high"></figure>
      </section>
      <section class="workflow" id="workflow"><div class="wrap">
        <h2>From the tray to your next find.</h2>
        <div class="step-tabs" aria-label="Preview the workflow"><button v-for="(s,index) in steps" :key="s.label" :aria-pressed="selected===index" @click="selected=index">{{ s.label }}</button></div>
        <div class="step-preview collection-workflow"><div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div>
          <img src="/collector-desk.jpg" alt="Collector holding a worn coin by its edge at a cataloging desk" width="960" height="640" loading="lazy">
        </div>
      </div></section>
      <section class="features wrap" id="features" aria-label="Common collecting problems">
        <article v-for="item in steps" :key="item.label"><h3>{{item.problem}}</h3><p>{{item.benefit}}</p></article>
      </section>
      <section class="collection-privacy wrap" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">You decide what leaves your device.</h2>
        <div>
          <p>Guest scans and drafts stay on your device. Online identification sends only the photos you select. Keep a copy with an encrypted backup, or export a spreadsheet and choose whether it includes private fields.</p>
          <p>Prefer to work in a browser? Open a separate web collection with email sign-in. Your guest records stay on your device when you sign in.</p>
          <a class="text-link" href="/privacy">Read how we handle your photos and records ↗</a>
        </div>
      </section>
    </main>
    <SiteNav footer path="/"/>
  </div>
</template>
