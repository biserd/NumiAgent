import { decode, encode } from 'jpeg-js'

const angles=Array.from({length:24},(_,index)=>{
  const angle=index*Math.PI/12
  return [Math.cos(angle),Math.sin(angle)]
})

export function findCircularRim(pixels:{data:Uint8Array;width:number;height:number},padding=1.6) {
  const scale=Math.min(1,144/Math.max(pixels.width,pixels.height))
  const width=Math.floor(pixels.width*scale)
  const height=Math.floor(pixels.height*scale)
  const shades=new Uint8Array(width*height)
  for (let y=0;y<height;y++) {
    for (let x=0;x<width;x++) {
      const index=(Math.floor(y/scale)*pixels.width+Math.floor(x/scale))*4
      shades[y*width+x]=.299*pixels.data[index]+.587*pixels.data[index+1]+.114*pixels.data[index+2]
    }
  }
  const horizontal=new Int16Array(shades.length)
  const vertical=new Int16Array(shades.length)
  for (let y=1;y<height-1;y++) {
    for (let x=1;x<width-1;x++) {
      const at=y*width+x
      horizontal[at]=shades[at+1]-shades[at-1]
      vertical[at]=shades[at+width]-shades[at-width]
    }
  }
  let best={x:0,y:0,radius:0,score:0}
  const shorterSide=Math.min(width,height)
  const minRadius=Math.max(8,Math.round(shorterSide*.09))
  const maxRadius=Math.round(shorterSide*.43)
  for (let radius=minRadius;radius<=maxRadius;radius+=2) {
    const offsets=angles.map(([cos,sin])=>({
      cos,sin,
      indexes:[radius-1,radius,radius+1].map(distance=>Math.round(distance*cos)+width*Math.round(distance*sin))
    }))
    const margin=radius+3
    for (let y=margin;y<height-margin;y+=2) {
      for (let x=margin;x<width-margin;x+=2) {
        const center=y*width+x
        let score=0
        let coverage=0
        for (const {cos,sin,indexes} of offsets) {
          let strongest=0
          for (const offset of indexes) {
            const index=center+offset
            strongest=Math.max(strongest,Math.abs(horizontal[index]*cos+vertical[index]*sin))
          }
          if (strongest>=18) coverage++
          score+=Math.min(60,strongest)
        }
        if (coverage>=19 && score>best.score) best={x,y,radius,score}
      }
    }
  }
  if (best.score<700) return null
  // Allow room for the struck edge when the visible rim is irregular or slightly foreshortened.
  const padded=best.radius*padding
  const left=Math.floor(Math.max(0,best.x-padded)/scale)
  const top=Math.floor(Math.max(0,best.y-padded)/scale)
  const right=Math.min(pixels.width,Math.ceil((best.x+padded)/scale))
  const bottom=Math.min(pixels.height,Math.ceil((best.y+padded)/scale))
  return {left,top,width:right-left,height:bottom-top}
}

export function cropCoinJpeg(original:Uint8Array,forExternalSearch=false) {
  const pixels=decode(original,{useTArray:true,maxResolutionInMP:8,maxMemoryUsageInMB:48})
  const crop=findCircularRim(pixels,forExternalSearch ? 1.13 : 1.6)
  if (!crop || crop.width<100 || crop.height<100 ||
      (!forExternalSearch && crop.width*crop.height>pixels.width*pixels.height*.65)) return null
  const {left,top,width,height}=crop
  const data=new Uint8Array(width*height*4)
  for (let row=0;row<height;row++) {
    const start=((top+row)*pixels.width+left)*4
    data.set(pixels.data.subarray(start,start+width*4),row*width*4)
  }
  return encode({data,width,height},90).data
}
