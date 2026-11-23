import antiquity from '../../../ios/NumiAgent/Assets.xcassets/CardAntiquity.imageset/frame.jpg?url'
import mint from '../../../ios/NumiAgent/Assets.xcassets/CardMint.imageset/frame.jpg?url'
import engraving from '../../../ios/NumiAgent/Assets.xcassets/CardEngraving.imageset/frame.jpg?url'
import { photoURL, type Link, type Specimen } from './api'
import type { cardDetails } from './cardDetails'

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

export async function drawOpinionCard(piece:CardRecord, photos:CardPhotos, style:CardStyle, question:string,
  stats:ReturnType<typeof cardDetails>, includePaid:boolean, artwork?:HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image export is unavailable in this browser.')
  function wrap(value:string,width:number,font:string) {
    const painter=ctx!
    painter.font=font
    const rows:string[]=[]
    let line=''
    for(const word of value.trim().split(/\s+/)){
      const next=line?line+' '+word:word
      if(painter.measureText(next).width<=width){line=next;continue}
      if(line) rows.push(line)
      line=''
      for(const char of word){
        if(line && painter.measureText(line+char).width>width){ rows.push(line);line='' }
        line+=char
      }
    }
    if(line) rows.push(line)
    return rows
  }
  const quoteFont='19px Georgia, serif'
  const legends=stats.inscriptions.map(f=>({...f,rows:wrap(f.value,382,quoteFont)}))
  const legendHeight=legends.reduce((sum,legend)=>sum+29+legend.rows.length*23,0)
  const factRows=Math.ceil(stats.facts.length/3)
  const priceLines=stats.price?wrap(stats.price.source,382,'13px sans-serif'):[]
  const priceHeight=stats.price?73+priceLines.length*16:0
  const paidHeight=includePaid && stats.paid?33:0
  const height=600+legendHeight+Math.max(0,factRows-1)*50+priceHeight+paidHeight
  canvas.height = height*3
  ctx.scale(3,3)
  ctx.drawImage(artwork ?? await readImage(cardStyles[style].image),0,0,480,height)
  const shade = ctx.createLinearGradient(0,0,0,height)
  shade.addColorStop(0,'#0008')
  shade.addColorStop(.5,'#0002')
  shade.addColorStop(1,'#000b')
  ctx.fillStyle=shade
  ctx.fillRect(0,0,480,height)
  const ink=cardStyles[style].ink
  ctx.strokeStyle=ink
  ctx.lineWidth=.6
  ctx.strokeRect(15,15,450,height-30)
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
  let cursor=462
  if(legends.length){
    ctx.fillStyle='rgba(0,0,0,.58)'
    ctx.fillRect(36,cursor,408,legendHeight-3)
    ctx.fillStyle=ink
    ctx.fillRect(36,cursor,2,legendHeight-3)
    for(const legend of legends){
      ctx.fillStyle=ink;ctx.font='bold 9px sans-serif'
      ctx.fillText(legend.label,48,cursor+14)
      ctx.fillStyle='#fff';ctx.font=quoteFont
      legend.rows.forEach((line,i)=>ctx.fillText(line,48,cursor+37+i*23))
      cursor+=29+legend.rows.length*23
    }
  }
  stats.facts.forEach(({label,value},i)=>{
    const width=408/Math.min(3,stats.facts.length), x=36+i%3*width, y=cursor+Math.floor(i/3)*50
    ctx.fillStyle=ink
    ctx.font='bold 9px sans-serif'
    ctx.fillText(label,x,y+16)
    ctx.fillStyle='#fff'
    lines(value,x,y+36,width-8,'15px sans-serif',16,2)
  })
  cursor+=Math.max(1,factRows)*50+9
  if(stats.price){
    ctx.fillStyle='rgba(0,0,0,.65)'
    ctx.fillRect(36,cursor,408,priceHeight-8)
    ctx.strokeStyle=ink;ctx.strokeRect(36,cursor,408,priceHeight-8)
    ctx.fillStyle=ink;ctx.font='bold 10px sans-serif'
    ctx.fillText(stats.price.label,48,cursor+17)
    ctx.font='27px Georgia, serif';ctx.fillText(stats.price.amount,48,cursor+47,382)
    ctx.fillStyle='#fff';ctx.font='13px sans-serif'
    priceLines.forEach((line,i)=>ctx.fillText(line,48,cursor+66+i*16))
    cursor+=priceHeight
  }
  if(paidHeight){
    ctx.fillStyle='#fff';ctx.font='bold 15px sans-serif'
    ctx.fillText('Purchase price · '+stats.paid,36,cursor+21)
    cursor+=paidHeight
  }
  ctx.fillStyle=ink
  ctx.fillRect(36,cursor+8,408,.7)
  ctx.fillStyle='#fff'
  lines(question,36,cursor+33,408,'23px Georgia, serif',25,2)
  const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!png) throw new Error('The card could not be exported.')
  return new File([png],'NumiAgent-second-opinion.png',{type:'image/png'})
}
