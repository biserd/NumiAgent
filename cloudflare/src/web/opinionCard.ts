import antiquity from '../../../ios/NumiAgent/Assets.xcassets/CardAntiquity.imageset/frame.jpg?url'
import mint from '../../../ios/NumiAgent/Assets.xcassets/CardMint.imageset/frame.jpg?url'
import engraving from '../../../ios/NumiAgent/Assets.xcassets/CardEngraving.imageset/frame.jpg?url'
import { photoURL, type Link, type Specimen } from './api'

export const cardStyles = {
  Antiquity: {image:antiquity, ink:'#ebca8b'},
  'Mint cabinet': {image:mint, ink:'#c7dbfc'},
  Engraving: {image:engraving, ink:'#fad6b5'}
}
export type CardStyle = keyof typeof cardStyles
export type CardRecord = Pick<Specimen,'title'|'type'|'year'|'issuer'|'denomination'>
export function suggestedStyle(piece:CardRecord):CardStyle {
  if (piece.type==='banknote') return 'Engraving'
  return /\b(ancient|roman|byzantine|hellenistic|achaemenid|ptolemaic|seleucid|denarius|aureus|sestertius|obol|stater|tetradrachm|bce|bc)\b/i
    .test([piece.title,piece.issuer,piece.denomination,piece.year].join(' ')) ? 'Antiquity' : 'Mint cabinet'
}

export function cardQuestions(type:Specimen['type']) {
  return type==='banknote'
    ? ['Which issue do you think this is?', 'Do the signatures narrow down the series?', 'Which catalog reference would you use?']
    : ['What points you toward this identification?', 'Can you place the mint or variety?', 'Which catalog reference would you use?']
}

const readImage = async (url:string) => {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}

export async function loadCardPhotos(links:Link[]) {
  const sides = ['obverse','reverse'].map(side=>links.find(link=>link.side===side)).filter((link):link is Link=>!!link)
  const photos = [...new Set([...sides,...links])].slice(0,2)
  if (!photos.length) throw new Error('Add a photo before creating a card.')
  return Promise.all(photos.map(async link=>({image:await readImage(photoURL(link.photoId)),crop:link.crop})))
}

type CardPhotos = Awaited<ReturnType<typeof loadCardPhotos>>

export async function customCardFrame(photos:CardPhotos,style:CardStyle,signal:AbortSignal) {
  const canvas=document.createElement('canvas')
  canvas.width=canvas.height=1
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  if(!ctx) throw new Error('Photo color sampling is unavailable.')
  const colors=photos.map(({image,crop})=>{
    ctx.drawImage(image,(crop?.x ?? 0)*image.width,(crop?.y ?? 0)*image.height,
      (crop?.width ?? 1)*image.width,(crop?.height ?? 1)*image.height,0,0,1,1)
    return '#'+Array.from(ctx.getImageData(0,0,1,1).data.slice(0,3),c=>c.toString(16).padStart(2,'0')).join('')
  })
  const response=await fetch('/api/v1/card-frame',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({style,colors}),signal})
  if(!response.ok) throw new Error(response.status===429?'Daily frame limit reached. The selected design is ready to share.'
    :'A custom frame is unavailable. The selected design is ready to share.')
  const url=URL.createObjectURL(await response.blob())
  try{return await readImage(url)}finally{URL.revokeObjectURL(url)}
}

export async function drawOpinionCard(piece:CardRecord, photos:CardPhotos, style:CardStyle, question:string, artwork?:HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 1800
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image export is unavailable in this browser.')
  ctx.scale(3,3)
  ctx.drawImage(artwork ?? await readImage(cardStyles[style].image),0,0,480,600)
  const shade = ctx.createLinearGradient(0,0,0,600)
  shade.addColorStop(0,'#0008')
  shade.addColorStop(.5,'#0002')
  shade.addColorStop(1,'#000b')
  ctx.fillStyle=shade
  ctx.fillRect(0,0,480,600)
  const ink=cardStyles[style].ink
  ctx.strokeStyle=ink
  ctx.lineWidth=.6
  ctx.strokeRect(15,15,450,570)
  ctx.fillStyle=ink
  ctx.font='bold 12px sans-serif'
  ctx.fillText('NUMIAGENT',36,49)
  ctx.textAlign='right'
  ctx.fillText('SECOND OPINION',444,49)
  ctx.textAlign='left'
  ctx.fillRect(36,63,408,.7)
  ctx.font='bold 10px sans-serif'
  ctx.fillText('TENTATIVE IDENTIFICATION',36,88)
  function lines(text:string, x:number, y:number, width:number, font:string, leading:number, count:number) {
    if (!ctx) return y
    ctx.font=font
    const words=text.trim().split(/\s+/)
    for (let row=0;row<count && words.length;row++) {
      let line=words.shift()!
      while(words.length && ctx.measureText(line+' '+words[0]).width<=width) line+=' '+words.shift()
      if ((row===count-1 && words.length) || ctx.measureText(line).width>width) {
        while(line.length && ctx.measureText(line+'…').width>width) line=line.slice(0,-1)
        line+='…'
      }
      ctx.fillText(line,x,y,width)
      y+=leading
    }
    return y
  }
  ctx.fillStyle='#fff'
  const top=lines(piece.title.trim() || 'Unidentified '+piece.type,36,129,408,'36px Georgia, serif',39,2)-20
  const bottom=452
  const stacked=piece.type==='banknote'
  const gap=9
  const boxWidth=stacked?408:(408-gap*(photos.length-1))/photos.length
  const boxHeight=stacked?(bottom-top-gap*(photos.length-1))/photos.length:bottom-top
  photos.forEach(({image,crop},i)=>{
    const x=(crop?.x ?? 0)*image.width, y=(crop?.y ?? 0)*image.height
    const sw=(crop?.width ?? 1)*image.width, sh=(crop?.height ?? 1)*image.height
    if(sw<=0 || sh<=0) throw new Error('The saved photo crop is empty.')
    const scale=Math.min(boxWidth/sw,boxHeight/sh)
    const left=36+(stacked?0:i*(boxWidth+gap))+(boxWidth-sw*scale)/2
    const upper=top+(stacked?i*(boxHeight+gap):0)+(boxHeight-sh*scale)/2
    ctx.drawImage(image,x,y,sw,sh,left,upper,sw*scale,sh*scale)
    ctx.strokeStyle=ink
    ctx.lineWidth=.65
    ctx.strokeRect(left,upper,sw*scale,sh*scale)
  })
  const facts=[['ISSUER',piece.issuer],['DENOMINATION',piece.denomination],['DATE',piece.year]].filter(([,value])=>value.trim())
  facts.forEach(([name,value],i)=>{
    const width=408/facts.length, x=36+i*width
    ctx.fillStyle=ink
    ctx.font='bold 9px sans-serif'
    ctx.fillText(name,x,478)
    ctx.fillStyle='#fff'
    lines(value,x,498,width-8,'15px sans-serif',16,2)
  })
  ctx.fillStyle=ink
  ctx.fillRect(36,529,408,.7)
  ctx.fillStyle='#fff'
  lines(question,36,554,408,'23px Georgia, serif',25,2)
  const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!png) throw new Error('The card could not be exported.')
  return new File([png],'NumiAgent-second-opinion.png',{type:'image/png'})
}
