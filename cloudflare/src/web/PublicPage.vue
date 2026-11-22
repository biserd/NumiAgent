<script setup lang="ts">
import { developerLinks, sitePages, type SitePage } from './sitePages'
import { blogDate, blogPosts } from './blogPosts'
import SiteNav from './SiteNav.vue'
import ContactForm from './ContactForm.vue'
import LaunchActions from './LaunchActions.vue'
import { iosLandingPath } from './launch'
defineProps<{page:SitePage;path:string;appStoreAvailable:boolean}>()
</script>
<template>
  <div class="public-page">
    <SiteNav/>
    <main class="information">
      <div class="information-header wrap">
        <nav v-if="page.article" class="article-breadcrumbs" aria-label="Breadcrumb">
          <a href="/">NumiAgent</a>
          <span aria-hidden="true">/</span>
          <a href="/blog">{{sitePages['/blog'].title}}</a>
        </nav>
        <nav v-if="path==='/developers' || path.startsWith('/developers/')" class="developer-nav" aria-label="Developer documentation">
          <a v-for="link in developerLinks" :key="link.href" :href="link.href" :aria-current="path===link.href?'page':undefined">{{link.label}}</a>
        </nav>
        <h1>{{page.title}}</h1>
        <p>{{page.description}}</p>
        <p class="article-meta" v-if="page.article">
          {{page.article.topic}} · <time :datetime="page.article.published">{{blogDate(page.article.published)}}</time>
          <template v-if="page.article.updated"> · Updated <time :datetime="page.article.updated">{{blogDate(page.article.updated)}}</time></template>
        </p>
        <small v-if="page.effective">Effective {{page.effective}}</small>
        <LaunchActions v-if="page.launchActions && !page.article" :available="appStoreAvailable"/>
      </div>
      <div class="information-content wrap">
        <div v-if="path===iosLandingPath" class="launch-gallery">
          <figure><img src="/launch-media/iphone-identification.jpg" alt="iPhone capture tab showing a nickel photo and a Jefferson nickel identification suggestion" width="660" height="1434"><figcaption>Review a photo identification on iPhone.</figcaption></figure>
          <figure><img src="/launch-media/iphone-collection.jpg" alt="Searchable iPhone collection with coins and a banknote" width="660" height="1434"><figcaption>Find a saved coin or banknote.</figcaption></figure>
          <figure><img src="/launch-media/ipad-collection.jpg" alt="iPad layout showing the collection beside an open coin record" width="774" height="1032"><figcaption>Open the collection and a specimen side by side on iPad.</figcaption></figure>
        </div>
        <template v-if="path==='/blog'">
          <div class="post-grid">
            <article v-for="post in blogPosts" :key="post.path">
              <p class="article-meta">{{post.article.topic}}</p>
              <h2><a :href="post.path">{{post.title}}</a></h2>
              <p>{{post.description}}</p>
            </article>
          </div>
          <a class="feed-link" href="/blog/rss.xml">Subscribe via RSS</a>
        </template>
        <section v-for="section in page.sections" :key="section.title" :id="section.id">
          <h2>{{section.title}}</h2>
          <p v-for="(paragraph,index) in section.paragraphs" :key="index">
            <template v-if="typeof paragraph==='string'">{{paragraph}}</template>
            <template v-else>{{paragraph.before}}<a :href="paragraph.link.href">{{paragraph.link.label}}</a>{{paragraph.after}}</template>
          </p>
          <pre v-if="section.code" class="docs-code" tabindex="0"><code>{{section.code}}</code></pre>
          <div v-if="section.links?.length" class="information-links">
            <a v-for="link in section.links" :key="link.href" :href="link.href">{{link.label}} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <LaunchActions v-if="page.launchActions" :available="appStoreAvailable"/>
        <aside v-if="page.article" class="related-guides" aria-labelledby="related-guides-title">
          <h2 id="related-guides-title">Related collector guides</h2>
          <ul>
            <li v-for="post in blogPosts.filter(guide=>page.article?.related.includes(guide.path))" :key="post.path">
              <a :href="post.path">{{post.guideLabel}}</a>
            </li>
          </ul>
        </aside>
        <ContactForm v-if="path==='/contact'"/>
      </div>
    </main>
    <SiteNav footer :path="path"/>
  </div>
</template>
