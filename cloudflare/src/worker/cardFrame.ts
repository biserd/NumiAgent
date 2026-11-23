import { z } from 'zod'
import { body, fail, limit, type WebContext } from './core'

const input = z.object({
  style:z.enum(['Antiquity','Mint cabinet','Engraving']),
  colors:z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1).max(2)
}).strict()
const motifs = {
  Antiquity:'Weathered bronze with gold-leaf acanthus and Greek key corner ornaments.',
  'Mint cabinet':'Midnight enamel with platinum art deco corners and silver fan engravings.',
  Engraving:'Deep green intaglio paper with copper guilloche rosettes and fine engraved borders.'
}

export async function generateCardFrame(c:WebContext) {
  const {style,colors}=await body(c,input)
  if(!c.env.AI) return fail(503,'Custom frames are unavailable. You can still share the selected design.')
  await limit(c.env,'card_frame',c.get('user').id,5)
  await limit(c.env,'ai',c.get('user').id,Number(c.env.AI_PER_USER))
  await limit(c.env,'ai','global',Number(c.env.AI_GLOBAL))
  const prompt=[
    'Create only the full-bleed background plate for a luxury museum specimen card, viewed straight on.',
    motifs[style], 'Use these sampled colors as subtle accents: '+colors.join(', ')+'.',
    'Dark matte center with delicate illuminated ornament at the four outer corners only.',
    'No collectibles, coins, banknotes, portraits, symbols, text, letters or numbers.'
  ].join(' ')
  try {
    const result=await c.env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt,steps:4})
    if(!result.image || result.image.length>8*1024*1024) throw new Error('Invalid image')
    const bytes=Uint8Array.from(atob(result.image),char=>char.charCodeAt(0))
    return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'}})
  } catch {
    return fail(503,'A custom frame could not be generated. Your selected design is still available.')
  }
}
