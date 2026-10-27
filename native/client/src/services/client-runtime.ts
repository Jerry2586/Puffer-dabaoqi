// Optional packaged Android host. The desktop editor never provides this bridge.
declare global { interface Window { HetunNative?: {boot():string;ready():void;request(id:string,route:string,method:string,body:string):void;cancelRequest?(id:string):void;openExternal(id:string,url:string):void;exit():void}; } }
export function nativeHost(){return typeof window==='undefined'?undefined:window.HetunNative;}
export function nativeRuntime(){try{return JSON.parse(nativeHost()?.boot()||'null')?.runtime||null;}catch{return null;}}
const externalPending=new Map<string,{finish:(opened:boolean)=>void;timer:ReturnType<typeof setTimeout>}>();let externalSequence=0;
if(typeof window!=='undefined')window.addEventListener('hetun-external',((event:CustomEvent)=>{const {id,opened}=event.detail||{};const call=externalPending.get(id);if(!call)return;externalPending.delete(id);clearTimeout(call.timer);call.finish(opened===true);}) as EventListener);
export async function openExternal(url:string):Promise<boolean>{
 if(!/^https:\/\//i.test(url))return false;
 const host=nativeHost();if(host){
  if(externalPending.size>=16)return false;
  const id=String(++externalSequence);
  return new Promise(resolve=>{const timer=setTimeout(()=>{externalPending.delete(id);resolve(false);},5000);externalPending.set(id,{finish:resolve,timer});try{host.openExternal(id,url);}catch{clearTimeout(timer);externalPending.delete(id);resolve(false);}});
 }
 if(typeof window==='undefined')return false;
 try{window.open(url,'_blank','noopener,noreferrer');return true;}catch{return false;}
}

export interface OperationsStatus {state:'not-configured'|'connecting'|'connected'|'cached'|'offline';platform?:string;serviceBase?:string;version?:number;publishedAt?:string;lastSync?:number;error?:string}
