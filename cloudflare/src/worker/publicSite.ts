import { render } from '../../dist-server/render.js'
import { brand, canonicalOrigin, landingSeo, sitePages } from '../web/sitePages'
import type { Env } from './core'

const googleMeasurementId='G-X6DV07YFCJ'

export async function publicPage(request:Request,url:URL,env:Env) {
  const path=url.pathname.replace(/\/+$/,'') || '/'
  const page=Object.hasOwn(sitePages,path) ? sitePages[path] : undefined
  if (!page && path!=='/') return
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}})
  if (url.pathname!==path) {
    const destination=new URL(url)
    destination.pathname=path
    return Response.redirect(destination,308)
  }
  const title=page ? page.seoTitle ?? (page.title.includes(brand) ? page.title : page.title+' | '+brand) : landingSeo.title
  const description=page?.description ?? landingSeo.description
  const analytics=env.APP_MODE==='production' && url.origin===canonicalOrigin
  const canonical=canonicalOrigin+path
  const image=canonicalOrigin+'/roman-bronze.jpg'
  const article=page?.article
  const schema=article ? [{
    '@type':'BlogPosting',headline:page.title,description,url:canonical,mainEntityOfPage:canonical,
    datePublished:article.published,dateModified:article.updated ?? article.published,
    image:[image],inLanguage:'en',articleSection:article.topic,
    author:{'@type':'Organization',name:brand,url:canonicalOrigin+'/about'},
    publisher:{'@type':'Organization',name:brand,url:canonicalOrigin+'/'}
  },{
    '@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:brand,item:canonicalOrigin+'/'},
      {'@type':'ListItem',position:2,name:sitePages['/blog'].title,item:canonicalOrigin+'/blog'},
      {'@type':'ListItem',position:3,name:page.title,item:canonical}
    ]
  }] : [{
    '@type':path==='/' ? 'WebSite' : path==='/blog' ? 'CollectionPage' : 'WebPage',
    name:page?.title ?? brand,description,url:canonical,inLanguage:'en'
  }]
  const structured=JSON.stringify({'@context':'https://schema.org','@graph':schema}).replace(/</g,'\\u003c')
  const [shell,markup]=await Promise.all([env.ASSETS.fetch(new URL('/',env.APP_ORIGIN)),render(path)])
  if (!shell.ok) throw new Error('Public HTML shell is unavailable')
  const output=new HTMLRewriter()
    .on('title',{element(element){element.setInnerContent(title)}})
    .on('meta[name="description"]',{element(element){element.setAttribute('content',description)}})
    .on('link[rel="canonical"]',{element(element){element.setAttribute('href',canonical)}})
    .on('head',{element(element){
      const metadata:Record<string,string>={
        'og:site_name':brand,'og:type':article?'article':'website','og:title':title,'og:description':description,
        'og:url':canonical,'og:image':image,'og:image:alt':'Illustration of a Roman bronze coin'
      }
      if(article) {
        metadata['article:published_time']=new Date(article.published).toISOString()
        if(article.updated) metadata['article:modified_time']=new Date(article.updated).toISOString()
      }
      for(const [property,content] of Object.entries(metadata)) {
        element.append('<meta property="'+property+'" content="'+escapeAttribute(content)+'">',{html:true})
      }
      element.append('<script type="application/ld+json">'+structured+'</script>',{html:true})
      if (analytics) element.append('<meta name="numiagent-ga4" content="'+googleMeasurementId+'">',{html:true})
    }})
    .on('#app',{element(element){element.setAttribute('data-rendered','server');element.setInnerContent(markup,{html:true})}})
    .transform(shell)
  const headers=new Headers(output.headers)
  const csp=headers.get('Content-Security-Policy')
  if (analytics && csp) {
    headers.set('Content-Security-Policy',csp
      .replace(/(^|;)\s*script-src [^;]+/,'$& https://www.googletagmanager.com')
      .replace(/(^|;)\s*connect-src [^;]+/,'$& https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com')
      .replace(/(^|;)\s*img-src [^;]+/,'$& https://*.google-analytics.com https://www.googletagmanager.com'))
  }
  headers.delete('ETag')
  headers.delete('Last-Modified')
  headers.set('Cache-Control','public, max-age=60')
  return new Response(request.method==='HEAD' ? null : output.body,{headers})
}

function escapeAttribute(value:string) {
  return value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
}
