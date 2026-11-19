export async function loadAllPages<T>(fetchPage:(offset:number,size:number)=>Promise<T[]>,size=500):Promise<T[]>{
 const all:T[]=[];for(let offset=0;;offset+=size){const page=await fetchPage(offset,size);all.push(...page);if(page.length<size)return all;}
}
