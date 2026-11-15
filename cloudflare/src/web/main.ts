import { createApp, createSSRApp } from 'vue'
import App from './App.vue'
import PublicSite from './PublicSite.vue'
import { sitePages } from './sitePages'
import './style.css'

const path=location.pathname.replace(/\/$/,'') || '/'
const root=document.querySelector<HTMLElement>('#app')!
if (path==='/' || Object.hasOwn(sitePages,path)) {
  const mount=root.dataset.rendered==='server' ? createSSRApp : createApp
  mount(PublicSite,{path}).mount(root)
} else {
  createApp(App).mount(root)
}
