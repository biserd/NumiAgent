export const appStoreUrl = 'https://apps.apple.com/app/id6835208218'
export const launchEmailPath = '/launch-email'
export const iosLandingPath = '/coin-collection-app-iphone'

export type MarketingEvent = 'launch_signup' | 'app_store_click' | 'web_catalog_click'
type AnalyticsWindow = Window & {gtag?:(...args:unknown[])=>void}

export function trackMarketing(event:MarketingEvent) {
  try {
    if (localStorage.getItem('numiagent.analytics')!=='allow') return
    if (!document.querySelector('meta[name="numiagent-ga4"]')) return
    const target = window as AnalyticsWindow
    target.gtag?.('event',event,{page_path:location.pathname})
  } catch { /* Storage restrictions must not interrupt navigation or signup. */ }
}
