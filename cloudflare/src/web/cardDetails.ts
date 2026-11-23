import type { Specimen } from './api'

type CardSale = {id:string;amount:number;currency:string;house:string;auction:string;lot:string;date:string;basis:string;match:string;grade:string}
export type CardValuation = {range:{low:number;high:number}|null;currency:string;asOf:string;used:string[];evidence:CardSale[]}
type Field = {label:string;value:string}
type Price = {label:string;amount:string;source:string}
const number = new Intl.NumberFormat('en',{maximumFractionDigits:3})
const currencies = new Set(Intl.supportedValuesOf('currency'))
function money(amount:unknown, code:unknown) {
  const currency = String(code ?? '').trim().toUpperCase()
  if (typeof amount!=='number' || !Number.isFinite(amount) || amount<0 || !currencies.has(currency)) return ''
  return currency+' '+new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(amount)
}

function marketPrice(valuation:CardValuation|null, grade:string):Price|undefined {
  if (!valuation) return
  const {range,currency,asOf,evidence}=valuation
  const used=new Set(valuation.used)
  if (range && used.size>=3 && range.high>=range.low && money(range.low,currency)) {
    return {label:'ESTIMATED MARKET RANGE',amount:money(range.low,currency)+' – '+number.format(range.high),
      source:used.size+' comparable sales incl. premium · '+asOf}
  }
  const sales=evidence.filter(sale=>sale.date<=asOf && (used.has(sale.id) ||
    (sale.match==='strong' && (!grade.trim() || sale.grade.trim().toLowerCase()===grade.trim().toLowerCase()))))
  const sale=sales.sort((a,b)=>b.date.localeCompare(a.date))[0]
  if (!sale || !money(sale.amount,sale.currency)) return
  return {label:'COMPARABLE AUCTION SALE',amount:money(sale.amount,sale.currency)+(sale.basis==='hammer'?' hammer':' incl. premium'),
    source:[sale.house,sale.auction,'Lot '+sale.lot,sale.date,sale.grade].filter(Boolean).join(' · ')}
}

export function cardDetails(piece:Specimen, valuation:CardValuation|null) {
  const d=piece.details ?? {}
  const unit=(value:unknown,suffix:string)=>typeof value==='number' && value>0 ? number.format(value)+' '+suffix : ''
  const fields=(entries:[string,unknown][]):Field[]=>entries.flatMap(([label,raw])=>{
    const value=String(raw ?? '').trim()
    return value?[{label,value}]:[]
  })
  const facts=fields([['ISSUER',piece.issuer],['DENOMINATION',piece.denomination],['DATE',piece.year],
    ['MINT',d.mint],['METAL',d.metal],['WEIGHT',unit(d.weightG,'g')],['DIAMETER',unit(d.diameterMm,'mm')],
    ['SERIES',d.series],['SIGNATURES',d.signatures],['GRADE',piece.grade],['CATALOG REF.',piece.reference],
    ['MINT MARK',d.mintMark],['RULER',piece.ruler],['VARIETY',d.variant],['DIE AXIS',unit(d.dieAxis,'h')]])
  const inscriptions=fields([[piece.type==='banknote'?'FACE':'OBVERSE',d.obverseLegend],
    [piece.type==='banknote'?'BACK':'REVERSE',d.reverseLegend]])
  const other=fields([['INSCRIPTION',d.inscriptions]])[0]
  if (other && !inscriptions.some(line=>line.value.toLowerCase()===other.value.toLowerCase())) inscriptions.push(other)
  return {facts,inscriptions,price:marketPrice(valuation,piece.grade),paid:money(d.purchasePrice,d.currency)}
}
