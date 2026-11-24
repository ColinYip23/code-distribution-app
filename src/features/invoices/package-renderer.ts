import JSZip from 'jszip';
import Decimal from 'decimal.js';
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import type { TemplateMapping, RenderInvoice } from './render';

const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const serializer=new XMLSerializer();
function parse(xml:string):XmlDocument{
  if(xml.length>16*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported template XML.');
  return new DOMParser().parseFromString(xml,'application/xml');
}
function elements(parent:XmlDocument|XmlElement,name:string):XmlElement[]{return Array.from(parent.getElementsByTagNameNS(NS,name));}
function address(value:string){const match=/^([A-Z]+)([1-9][0-9]*)$/.exec(value);if(!match)throw new Error('Invalid template address.');let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;return{row:Number(match[2]),col};}
function columnName(col:number){let name='';for(;col>0;col=Math.floor((col-1)/26))name=String.fromCharCode(65+(col-1)%26)+name;return name;}
function range(value:string){const[first,last=first]=value.split(':');const start=address(first),end=address(last);if(end.row<start.row||end.col<start.col||end.row-start.row>1000||end.col-start.col>100)throw new Error('Template range is too large or reversed.');return{start,end};}

/** Patch worksheet values in-place in the XLSX package; retain native shapes, images and print setup. */
export async function renderPreservedPackage(bytes:Uint8Array,mapping:TemplateMapping,invoice:RenderInvoice):Promise<Uint8Array>{
  const zip=await JSZip.loadAsync(bytes);
  async function xml(path:string){const file=zip.file(path);if(!file)throw new Error('Template workbook structure is incomplete.');return parse(await file.async('string'));}
  const workbook=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels');
  const sheet=elements(workbook,'sheet').find(s=>s.getAttribute('name')===mapping.worksheet);
  if(!sheet)throw new Error('Mapped worksheet does not exist.');
  const relation=Array.from(rels.getElementsByTagNameNS(PACKAGE_REL,'Relationship')).find(r=>r.getAttribute('Id')===sheet.getAttributeNS(REL,'id'));
  const target=relation?.getAttribute('Target');if(!target)throw new Error('Mapped worksheet is unavailable.');
  const sheetPath=target.startsWith('/')?target.slice(1):`xl/${target}`;
  if(!/^xl\/worksheets\/[^/]+\.xml$/.test(sheetPath))throw new Error('Unsupported worksheet relationship.');
  const doc=await xml(sheetPath),root=doc.documentElement,data=elements(doc,'sheetData')[0];if(!data||!root)throw new Error('Template has no worksheet data.');
  const rows=new Map(elements(data,'row').map(row=>[Number(row.getAttribute('r')),row]));
  const cells=new Map(elements(data,'c').map(c=>[c.getAttribute('r')!,c]));
  const newElement=(name:string)=>doc.createElementNS(NS,name);
  function getCell(ref:string){
    let cell=cells.get(ref);if(cell)return cell;
    const pos=address(ref);let row=rows.get(pos.row);
    if(!row){row=newElement('row');row.setAttribute('r',String(pos.row));const next=[...rows].filter(([number])=>number>pos.row).sort((a,b)=>a[0]-b[0])[0]?.[1];data.insertBefore(row,next??null);rows.set(pos.row,row);}
    cell=newElement('c');cell.setAttribute('r',ref);
    const next=elements(row,'c').find(c=>address(c.getAttribute('r')!).col>pos.col);row.insertBefore(cell,next??null);cells.set(ref,cell);return cell;
  }
  function clear(ref:string){const cell=cells.get(ref);if(!cell)return;for(const child of [...Array.from(cell.childNodes)])if(['v','f','is'].includes(child.localName??''))cell.removeChild(child);cell.removeAttribute('t');}
  function write(ref:string,value:string|number|null){
    const cell=getCell(ref);clear(ref);if(value===null||value==='')return;
    if(typeof value==='number'){const v=newElement('v');v.textContent=String(value);cell.appendChild(v);}
    else{cell.setAttribute('t','inlineStr');const inline=newElement('is'),text=newElement('t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.textContent=value;inline.appendChild(text);cell.appendChild(inline);}
  }
  for(const value of mapping.clearRanges??[]){const{start,end}=range(value);for(let row=start.row;row<=end.row;row++)for(let col=start.col;col<=end.col;col++)clear(`${columnName(col)}${row}`);}
  let merges=elements(doc,'mergeCells')[0];
  for(const value of mapping.mergeRanges??[]){
    range(value);if(merges&&elements(merges,'mergeCell').some(m=>m.getAttribute('ref')===value))continue;
    if(!merges){merges=newElement('mergeCells');const next=Array.from(root.childNodes).find(node=>['phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','drawing','legacyDrawing','extLst'].includes(node.localName??''));root.insertBefore(merges,next??null);}
    const merge=newElement('mergeCell');merge.setAttribute('ref',value);merges.appendChild(merge);merges.setAttribute('count',String(elements(merges,'mergeCell').length));
  }
  const styles=await xml('xl/styles.xml');let stylesChanged=false;
  function style(ref:string,kind:'wrap'|'date'|'shrink'){
    const cell=getCell(ref),collection=elements(styles,'cellXfs')[0],original=elements(collection,'xf')[Number(cell.getAttribute('s')??0)];if(!original)return;
    if(kind==='date'&&!mapping.dateFormat&&original.getAttribute('numFmtId')!=='0')return;
    const copy=original.cloneNode(true) as XmlElement;
    if(kind==='date'){
      let numberFormat='14';
      if(mapping.dateFormat){
        const styleRoot=styles.documentElement;if(!styleRoot)throw new Error('Missing template styles.');let formats=elements(styles,'numFmts')[0];
        if(!formats){formats=styles.createElementNS(NS,'numFmts');styleRoot.insertBefore(formats,styleRoot.firstChild);}
        let format=elements(formats,'numFmt').find(f=>f.getAttribute('formatCode')===mapping.dateFormat);
        if(!format){format=styles.createElementNS(NS,'numFmt');format.setAttribute('numFmtId',String(Math.max(163,...elements(formats,'numFmt').map(f=>Number(f.getAttribute('numFmtId'))))+1));format.setAttribute('formatCode',mapping.dateFormat);formats.appendChild(format);formats.setAttribute('count',String(elements(formats,'numFmt').length));}
        numberFormat=format.getAttribute('numFmtId')!;
      }
      copy.setAttribute('numFmtId',numberFormat);copy.setAttribute('applyNumberFormat','1');
    }else{let align=elements(copy,'alignment')[0];if(!align){align=styles.createElementNS(NS,'alignment');copy.appendChild(align);}if(kind==='wrap'){align.setAttribute('wrapText','1');align.setAttribute('vertical','top');}else{align.setAttribute('shrinkToFit','1');align.setAttribute('wrapText','0');}copy.setAttribute('applyAlignment','1');}
    const index=elements(collection,'xf').length;collection.appendChild(copy);collection.setAttribute('count',String(index+1));cell.setAttribute('s',String(index));stylesChanged=true;
  }
  const date1904=elements(workbook,'workbookPr')[0]?.getAttribute('date1904');
  for(const[field,ref]of Object.entries(mapping.fields)){
    const value=invoice[field];if(!ref||typeof value!=='string')continue;
    if(['total','subtotal','discount','tax','adjustment'].includes(field))write(ref,new Decimal(value).toNumber());
    else if(field==='issueDate'||field==='dueDate'){
      if(!value)write(ref,null);else{const timestamp=Date.parse(`${value}T00:00:00Z`);if(!Number.isFinite(timestamp))throw new Error('Invalid invoice date.');const epoch=date1904==='1'||date1904==='true'?Date.UTC(1904,0,1):Date.UTC(1899,11,30);write(ref,(timestamp-epoch)/86400000);style(ref,'date');}
    }else write(ref,value?(mapping.fieldFormats?.[field as keyof typeof mapping.fieldFormats]?.replaceAll('{value}',value)??value):'');
    if(mapping.wrapFields?.includes(field as NonNullable<TemplateMapping['wrapFields']>[number]))style(ref,'wrap');
    if(mapping.shrinkFields?.includes(field as NonNullable<TemplateMapping['shrinkFields']>[number]))style(ref,'shrink');
  }
  const cols=mapping.columns;
  for(let index=0;index<mapping.maxItems;index++){
    const row=mapping.firstItemRow+index*(mapping.rowStep??1),item=invoice.lines[index];
    for(const col of Object.values(cols))if(typeof col==='number')clear(`${columnName(col)}${row}`);
    if(!item)continue;
    write(`${columnName(cols.description)}${row}`,item.description);write(`${columnName(cols.quantity)}${row}`,item.quantity);
    write(`${columnName(cols.unitPrice)}${row}`,new Decimal(item.unitPrice).toNumber());
    const amount=new Decimal(item.unitPrice).mul(item.quantity).sub(item.discount);write(`${columnName(cols.amount)}${row}`,amount.add(amount.mul(item.taxRate).div(100).toDecimalPlaces(2)).toNumber());
    if(cols.itemNumber)write(`${columnName(cols.itemNumber)}${row}`,index+1);
    if(cols.unit)write(`${columnName(cols.unit)}${row}`,mapping.unitLabel??'Pcs');
  }
  if(mapping.printScale!==undefined){let page=elements(doc,'pageSetup')[0];if(!page){page=newElement('pageSetup');const next=Array.from(root.childNodes).find(n=>['headerFooter','rowBreaks','colBreaks','drawing','legacyDrawing','extLst'].includes(n.localName??''));root.insertBefore(page,next??null);}page.setAttribute('scale',String(mapping.printScale));}
  if(mapping.centerHorizontally!==undefined){let options=elements(doc,'printOptions')[0];if(!options){options=newElement('printOptions');const next=Array.from(root.childNodes).find(n=>['pageMargins','pageSetup','headerFooter','drawing','legacyDrawing','extLst'].includes(n.localName??''));root.insertBefore(options,next??null);}options.setAttribute('horizontalCentered',mapping.centerHorizontally?'1':'0');}
  zip.file(sheetPath,serializer.serializeToString(doc));
  if(stylesChanged)zip.file('xl/styles.xml',serializer.serializeToString(styles));
  // Remove unused original shared strings so cleared example client/line data is not retained in the package.
  if(zip.file('xl/sharedStrings.xml')){
    const shared=await xml('xl/sharedStrings.xml'),sharedRoot=shared.documentElement,items=elements(shared,'si'),used=new Set<number>(),documents=new Map<string,XmlDocument>([[sheetPath,doc]]);if(!sharedRoot)throw new Error('Invalid shared strings.');
    for(const path of Object.keys(zip.files).filter(path=>/^xl\/worksheets\/[^/]+\.xml$/.test(path))){const document=documents.get(path)??await xml(path);documents.set(path,document);for(const c of elements(document,'c'))if(c.getAttribute('t')==='s'){const v=elements(c,'v')[0];if(v)used.add(Number(v.textContent));}}
    const remap=new Map<number,number>();let next=0;items.forEach((item,index)=>{if(used.has(index))remap.set(index,next++);else sharedRoot.removeChild(item);});
    let count=0;for(const[path,document]of documents){for(const c of elements(document,'c'))if(c.getAttribute('t')==='s'){const v=elements(c,'v')[0];if(v){const number=remap.get(Number(v.textContent));if(number===undefined)throw new Error('Invalid shared-string reference in template.');v.textContent=String(number);count++;}}zip.file(path,serializer.serializeToString(document));}
    sharedRoot.setAttribute('count',String(count));sharedRoot.setAttribute('uniqueCount',String(next));zip.file('xl/sharedStrings.xml',serializer.serializeToString(shared));
  }
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
