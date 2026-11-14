export function estimateCost(input:{uploads:number;averageMB:number;storedGB:number;photoReads:number;aiCalls:number;aiInput:number;aiOutput:number;searches:number;searchPerRequest:number;emails:number;emailPerMessage:number}) {
  const storage = Math.max(0,input.storedGB-10)*.015
  const writes = Math.max(0,input.uploads-1_000_000)*4.5/1_000_000
  const reads = Math.max(0,input.photoReads-10_000_000)*.36/1_000_000
  const queues = Math.max(0,input.aiCalls*3-1_000_000)*.4/1_000_000
  const ai = input.aiCalls*(input.aiInput*.1+input.aiOutput*.3)/1_000_000
  const search = input.searches*input.searchPerRequest
  const email = input.emails*input.emailPerMessage
  return {addedGB:input.uploads*input.averageMB/1000,base:5,storage,writes,reads,queues,ai,search,email,
    estimated:5+storage+writes+reads+queues+ai+search+email}
}
