import { cropCoinJpeg } from './coinCloseup.ts'

export type CoinImage = {bytes:Uint8Array;mime:string}
export type CoinImages = readonly [CoinImage,CoinImage?]

export function coinSearchBytes({bytes,mime}:CoinImage) {
  if (mime!=='image/jpeg') return bytes
  try { return cropCoinJpeg(bytes) ?? bytes }
  catch { return bytes }
}

export function sourceLink(value:string|null|undefined) {
  if (!value || value.length > 1500) return
  try {
    const url=new URL(value)
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port) return
    url.protocol='https:'
    return url.href
  } catch { return }
}
