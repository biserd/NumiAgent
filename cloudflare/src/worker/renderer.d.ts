declare module '*dist-server/render.js' {
  export function render(path:string,appStoreAvailable:boolean):Promise<string>
}
