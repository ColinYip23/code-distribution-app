import{expect,it}from'vitest';
import{loadAllPages}from'@/lib/pagination';
it('keeps records beyond the first database response page',async()=>{
 const records=Array.from({length:1005},(_,i)=>i);
 expect(await loadAllPages(async(offset,size)=>records.slice(offset,offset+size))).toHaveLength(1005);
});
