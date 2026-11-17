export const API = '/api/v1'
export async function request<T = unknown>(path:string, method='GET', value?:unknown):Promise<T> {
  const binary = value instanceof Blob
  const response = await fetch(API+path,{
    method,credentials:'same-origin',
    headers:value === undefined ? undefined : {'Content-Type':binary ? value.type : 'application/json'},
    body:value === undefined ? undefined : binary ? value : JSON.stringify(value)
  })
  if (!response.ok) {
    const error = await response.json().catch(()=>({error:'Request failed'})) as {error?:string}
    throw new Error(error.error || 'Request failed')
  }
  return response.status===204 ? undefined as T : response.json()
}
export const message = (error:unknown) => error instanceof Error ? error.message : 'Request failed'
export type Folder = {id:string;name:string}
export type Photo = {id:string;state:string;candidates:Candidate[];error?:string}
export type Box = {x:number;y:number;width:number;height:number}
export type Link = {photoId:string;side:'obverse'|'reverse'|'overview';crop?:Box|null}
export type RecordForm = {
  type:'coin'|'banknote';title:string;issuer:string;ruler:string;denomination:string;year:string;reference:string;
  grade:string;notes:string;tags:string;collection_id:string|null;details:Record<string,string|number|undefined>;photos?:Link[]
}
export type Specimen = RecordForm & {id:string;photo:string|null;duplicates?:{id:string;title:string}[];googleVisionAvailable?:boolean}
export type Candidate = Partial<RecordForm> & {type:'coin'|'banknote';title:string;confidence:number;crop?:Box;model?:string;
  referenceMatches?:{source:string;label:string;kind:string;attribution:string;license:string}[]}
export type ScanLead = {source:string;label:string;attribution:string;excerpt?:string;obverse?:string;reverse?:string;supports?:string[];conflicts?:string[]}
export type ScanReview = {stage:string;leads:ScanLead[];providers:Record<string,string>;next?:string}
export const emptyItem = ():RecordForm => ({type:'coin',title:'',issuer:'',ruler:'',denomination:'',year:'',reference:'',grade:'',notes:'',tags:'',collection_id:null,details:{}})
export const cleanItem = (fields:RecordForm) => ({...fields,details:Object.fromEntries(
  Object.entries(fields.details ?? {}).filter(([,value])=>value!=='' && value!==undefined && value!==null))})
export const photoURL = (id:string) => API+'/photos/'+id

export async function preparePhoto(file:File,keepOriginal=false) {
  if (keepOriginal && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size<=6*1024*1024) return file
  let picture:ImageBitmap|HTMLImageElement
  try { picture=await createImageBitmap(file,{imageOrientation:'from-image'}) }
  catch {
    const url=URL.createObjectURL(file)
    try {
      const image=new Image()
      image.src=url
      await image.decode()
      picture=image
    } catch { throw new Error('This format could not be decoded. Choose a JPEG image.') }
    finally { URL.revokeObjectURL(url) }
  }
  const scale=Math.min(1,2048/Math.max(picture.width,picture.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(picture.width*scale))
  canvas.height=Math.max(1,Math.round(picture.height*scale))
  const painter=canvas.getContext('2d')
  if (!painter) throw new Error('Image processing unavailable')
  painter.fillStyle='#fff'
  painter.fillRect(0,0,canvas.width,canvas.height)
  painter.drawImage(picture,0,0,canvas.width,canvas.height)
  if ('close' in picture) picture.close()
  const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.86))
  if (!result) throw new Error('Image conversion failed')
  return result
}
