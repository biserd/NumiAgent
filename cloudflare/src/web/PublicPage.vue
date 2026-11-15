<script setup lang="ts">
import { developerLinks, type SitePage } from './sitePages'
import { blogDate, blogPosts } from './blogPosts'
import SiteNav from './SiteNav.vue'
import ContactForm from './ContactForm.vue'
defineProps<{page:SitePage;path:string}>()
</script>
<template>
  <div class="public-page">
    <SiteNav/>
    <main class="information">
      <div class="information-header wrap">
        <a v-if="page.article" class="article-back" href="/blog">← NumiAgent blog</a>
        <nav v-if="path==='/developers' || path.startsWith('/developers/')" class="developer-nav" aria-label="Developer documentation">
          <a v-for="link in developerLinks" :key="link.href" :href="link.href" :aria-current="path===link.href?'page':undefined">{{link.label}}</a>
        </nav>
        <h1>{{page.title}}</h1>
        <p>{{page.description}}</p>
        <p class="article-meta" v-if="page.article">{{page.article.topic}} · <time :datetime="page.article.published">{{blogDate(page.article.published)}}</time></p>
        <small v-if="page.effective">Effective {{page.effective}}</small>
      </div>
      <div class="information-content wrap">
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
        <section v-for="section in page.sections" :key="section.title">
          <h2>{{section.title}}</h2>
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{paragraph}}</p>
          <pre v-if="section.code" class="docs-code" tabindex="0"><code>{{section.code}}</code></pre>
          <div v-if="section.links?.length" class="information-links">
            <a v-for="link in section.links" :key="link.href" :href="link.href">{{link.label}} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <aside v-if="page.article" class="related-guides" aria-labelledby="related-guides-title">
          <h2 id="related-guides-title">Related collector guides</h2>
          <ul>
            <template v-for="post in blogPosts" :key="post.path">
              <li v-if="path!==post.path"><a :href="post.path">{{post.guideLabel}}</a></li>
            </template>
          </ul>
        </aside>
        <ContactForm v-if="path==='/contact'"/>
      </div>
    </main>
    <SiteNav footer :path="path"/>
  </div>
</template>
