import { build } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { brand, canonicalOrigin, sitePages } from '../src/web/sitePages'
import { blogPosts } from '../src/web/blogPosts'

const escapeXml = (value:string) => value.replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]!)

function privateHtml(template:string,title:string,description:string,body:string) {
  const start=template.indexOf('<div id="app">')
  const end=template.lastIndexOf('</div>')
  if(start<0 || end<start) throw new Error('Cannot find the Vite application mount')
  return (template.slice(0,start)+'<div id="app">'+body+template.slice(end))
    .replace(/<title>[^<]*<\/title>/,'<title>'+escapeXml(title)+'</title>')
    .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+escapeXml(description)+'">')
    .replace(/<link rel="canonical" href="[^"]*">/,'<meta name="robots" content="noindex">')
}

export function publicPages():Plugin {
  return {
    name:'numiagent-public-pages',apply:'build',
    generateBundle:{order:'post',handler(_options,bundle) {
      const asset=bundle['index.html']
      if(!asset || asset.type!=='asset') throw new Error('The server renderer needs the Vite HTML entry')
      const template=typeof asset.source==='string'?asset.source:new TextDecoder().decode(asset.source)
      this.emitFile({type:'asset',fileName:'app.html',source:privateHtml(template,'Your collection · '+brand,
        'Open your private coin and banknote collection.','<main><h1>Sign in to '+brand+'</h1><p>Opening your collection…</p></main>')})
      this.emitFile({type:'asset',fileName:'404.html',source:privateHtml(template,'Page unavailable · '+brand,
        'Find your way back to NumiAgent.','<main><h1>Page unavailable</h1><p><a href="/">Return to NumiAgent</a></p></main>')})
      const urls=['/',...Object.keys(sitePages)].map(path=>{
        const article=sitePages[path]?.article
        const lastmod=article ? '<lastmod>'+escapeXml(article.updated ?? article.published)+'</lastmod>' : ''
        return '<url><loc>'+escapeXml(canonicalOrigin+path)+'</loc>'+lastmod+'</url>'
      }).join('')
      this.emitFile({type:'asset',fileName:'sitemap.xml',source:'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>'})
      const items=blogPosts.map(post=>{
        const url=escapeXml(canonicalOrigin+post.path)
        const pubDate=new Date(post.article.published).toUTCString()
        return '<item><title>'+escapeXml(post.title)+'</title><link>'+url+'</link><guid>'+url+'</guid><description>'+
          escapeXml(post.description)+'</description><pubDate>'+pubDate+'</pubDate><category>'+escapeXml(post.article.topic)+'</category></item>'
      }).join('')
      this.emitFile({type:'asset',fileName:'blog/rss.xml',source:'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'+
        '<title>NumiAgent blog</title><link>'+canonicalOrigin+'/blog</link><description>'+escapeXml(sitePages['/blog'].description)+
        '</description><language>en</language>'+items+'</channel></rss>'})
    }},
    async closeBundle() {
      await build({
        configFile:false,
        publicDir:false,
        plugins:[vue({template:{transformAssetUrls:false}})],
        ssr:{noExternal:true},
        build:{
          ssr:'src/web/server.ts',
          target:'es2023',
          outDir:'dist-server',
          rollupOptions:{output:{entryFileNames:'render.js'}}
        }
      })
    }
  }
}
