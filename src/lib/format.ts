export function date(value:string){return new Date(value.length===10?`${value}T12:00:00Z`:value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kuala_Lumpur'});}
export function localToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'});}
export function addDays(value:string,days:number){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
