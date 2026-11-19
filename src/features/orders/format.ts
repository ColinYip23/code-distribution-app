export type AssignedCode = { product: string; code: string; productId?:string; sku?:string };
export function formatOrderCodes(codes: AssignedCode[], mode: 'codes' | 'message'): string {
  if (mode === 'codes') return codes.map(row => row.code).join('\n');
  const groups = new Map<string, {label:string;codes:string[]}>();
  codes.forEach(row=>{const key=row.productId??row.sku??row.product;const group=groups.get(key)??{label:row.sku?`${row.product} (${row.sku})`:row.product,codes:[]};group.codes.push(row.code);groups.set(key,group);});
  return [...groups.values()].map(({label,codes:values}) => `${label} — ${values.length} code${values.length === 1 ? '' : 's'}\n${values.join('\n')}`).join('\n\n');
}
