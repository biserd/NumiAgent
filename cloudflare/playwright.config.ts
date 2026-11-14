import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests',testMatch:'browser.spec.ts',workers:1,timeout:90000,
  use:{...process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL}:{},
    viewport:{width:390,height:844},isMobile:true,hasTouch:true}
})
