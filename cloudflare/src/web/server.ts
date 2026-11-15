import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import PublicSite from './PublicSite.vue'

export function render(path:string) {
  return renderToString(createSSRApp(PublicSite,{path}))
}
