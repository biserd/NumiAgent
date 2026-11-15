import type { Plugin } from 'vite'
import { brand, canonicalOrigin, siteLinks, sitePages } from '../src/web/sitePages'
import type { SitePage } from '../src/web/sitePages'

const html = (text:string) => text.replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]!)

function pageBody(page:SitePage,contact:boolean) {
  const sections=page.sections.map(section=>'<section><h2>'+html(section.title)+'</h2>'+
    section.paragraphs.map(paragraph=>'<p>'+html(paragraph)+'</p>').join('')+
    (section.code?'<pre class="docs-code"><code>'+html(section.code)+'</code></pre>':'')+
    (section.links?.map(link=>'<p><a href="'+html(link.href)+'">'+html(link.label)+'</a></p>').join('') ?? '')+
    '</section>').join('')
  return '<div class="public-page"><header class="site-header wrap"><a class="brand" href="/">'+brand+
    '</a><a href="/app">Sign in</a></header><main class="information"><div class="information-header wrap"><h1>'+
    html(page.title)+'</h1><p>'+html(page.description)+'</p>'+
    (page.effective?'<small>Effective '+html(page.effective)+'</small>':'')+
    '</div><div class="information-content wrap">'+
    (contact?'<noscript><p>Enable JavaScript to send a message.</p></noscript>':'')+sections+
    '</div></main><footer class="site-footer wrap"><nav aria-label="Site information">'+
    siteLinks.map(link=>'<a href="'+html(link.href)+'">'+html(link.label)+'</a>').join('')+
    '</nav></footer></div>'
}

function document(template:string, title:string, description:string, path:string, body:string, indexable=true) {
  const canonical=canonicalOrigin+path
  const appStart=template.indexOf('<div id="app">')
  const appEnd=template.lastIndexOf('</div>')
  if(appStart<0 || appEnd<appStart) throw new Error('Cannot find the public HTML fallback')
  const populated=template.slice(0,appStart)+'<div id="app">'+body+template.slice(appEnd)
  return populated
    .replace(/<title>[^<]*<\/title>/,'<title>'+html(title)+'</title>')
    .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+html(description)+'">')
    .replace(/<link rel="canonical" href="[^"]*">/,indexable?'<link rel="canonical" href="'+html(canonical)+'">':'<meta name="robots" content="noindex">')
}
export function publicPages():Plugin {
  return {
    name:'numiagent-public-pages',apply:'build',
    generateBundle:{order:'post',handler(_options,bundle) {
      const asset=bundle['index.html']
      if(!asset || asset.type!=='asset') throw new Error('Public pages require the Vite HTML entry')
      const template=typeof asset.source==='string'?asset.source:new TextDecoder().decode(asset.source)
      for(const [path,page] of Object.entries(sitePages)){
        const title=page.title.includes(brand)?page.title:page.title+' · '+brand
        this.emitFile({type:'asset',fileName:path.slice(1)+'.html',source:document(template,title,page.description,path,pageBody(page,path==='/contact'))})
      }
      this.emitFile({type:'asset',fileName:'app.html',source:document(template,'Your collection · '+brand,
        'Open your private coin and banknote collection.','/app','<main><h1>Sign in to '+brand+'</h1><p>Opening your collection…</p></main>',false)})
      this.emitFile({type:'asset',fileName:'404.html',source:document(template,'Page unavailable · '+brand,
        'Find your way back to NumiAgent.','/404','<main><h1>Page unavailable</h1><p><a href="/">Return to NumiAgent</a></p></main>',false)})
      const urls=['/',...Object.keys(sitePages)].map(path=>'<url><loc>'+html(canonicalOrigin+path)+'</loc></url>').join('')
      this.emitFile({type:'asset',fileName:'sitemap.xml',source:'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>'})
    }}
  }
}
