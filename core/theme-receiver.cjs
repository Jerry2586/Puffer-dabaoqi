'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {MAX,linkRoot,validId,atomic,readPeer}=require('./local-link.cjs');
const {parseTheme,installTheme}=require('./themes.cjs');
const {parseBase}=require('./base-apk.cjs');
class ThemeReceiver{
 constructor(store,notify,{root=linkRoot(),paused=()=>false}={}){this.store=store;this.notify=notify;this.root=root;this.paused=paused;this.running=null;this.error='';this.peer=null;this.connectionSnapshot='';this.catalogCount=0;}
 status(){return {enabled:true,root:this.root,last:this.store.state.localLink?.last||null,error:this.error,connected:!!this.peer,peerError:this.peer?.syncError||'',catalogCount:this.catalogCount};}
 async start(){await fs.mkdir(path.join(this.root,'inbox'),{recursive:true});await fs.mkdir(path.join(this.root,'receipts'),{recursive:true});await this.tick();this.timer=setInterval(()=>this.tick().catch(e=>{this.error=e.message;}),1500);this.timer.unref?.();return this;}
 stop(){clearInterval(this.timer);}
 async tick(){if(this.running)return this.running;this.running=this.consume().finally(()=>{this.running=null;});return this.running;}
 notifyConnection(){const status=this.status(),snapshot=JSON.stringify([status.connected,status.error,status.peerError,status.catalogCount]);if(this.connectionSnapshot!==snapshot){this.connectionSnapshot=snapshot;this.notify?.({type:'local-link',status});}}
 async catalog(){
  let raw;try{const file=path.join(this.root,'catalog.json');if((await fs.stat(file)).size>32768)throw Error('主题库索引超过限制');raw=await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
  const revision=crypto.createHash('sha256').update(raw).digest('hex');if(this.catalogRevision===revision)return;
  const index=JSON.parse(raw);if(index.protocol!=='hetun-local-catalog'||index.version!==1||!Array.isArray(index.entries)||index.entries.length>80)throw Error('主题库索引无效');
  const verified=[],ids=new Set();
  for(const entry of index.entries){
   if(!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.id!=='string'||!['mobile','tablet','tv','web','desktop'].includes(entry.platform))throw Error('主题库条目无效');
   const identity=entry.platform+':'+entry.id;if(ids.has(identity))throw Error('主题库条目重复');ids.add(identity);
   const file=path.join(this.root,'catalog',entry.sha256+'.zip');if((await fs.stat(file)).size>MAX)throw Error('主题包超过限制');const bytes=await fs.readFile(file);
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('主题库包校验失败');
   const {manifest}=parseTheme(bytes,'.zip');if(manifest.id!==entry.id||manifest.platform!==(entry.platform==='web'?'desktop':entry.platform))throw Error('主题库清单与索引不匹配');
   verified.push({entry,bytes,manifest});
  }
  const keys=new Set();
  for(const {entry,bytes,manifest}of verified){let theme=this.store.state.themes.find(t=>t.digest===entry.sha256&&t.id===manifest.id&&t.platform===manifest.platform);if(!theme)theme=await installTheme(this.store,bytes,'.zip','local-catalog');if(theme.origin==='local-catalog')theme.catalogActive=true;keys.add(theme.key);}
  for(const theme of this.store.state.themes)if(theme.origin==='local-catalog'&&!keys.has(theme.key))theme.catalogActive=false;
  await this.store.commit();this.catalogCount=keys.size;this.catalogRevision=revision;this.notify?.({type:'local-catalog',count:keys.size});
 }
 async publishCapabilities(){
  const app=this.store.state.apps.find(a=>a.id===this.store.state.selectedApp),device=app?.selectedDevice,os=app?.selectedOS;
  const data={protocol:'hetun-local-capabilities',version:1,updatedAt:new Date().toISOString(),app:app?{id:app.id,name:app.name,device,os}:null,base:null,baseDigest:'',error:''};
  try{if(!app)throw Error('打包器尚未选择应用');if(os!=='android')throw Error('当前平台尚未接入基础安装包重打包');const id=app.profiles[device][os].baseId,record=this.store.state.bases?.find(b=>b.id===id);if(!record)throw Error('打包器尚未选择基础 APK');const stat=await fs.stat(record.file),key=[record.id,record.digest,stat.size,stat.mtimeMs].join(':');if(this.baseSnapshot?.key!==key){const bytes=await fs.readFile(record.file),parsed=parseBase(bytes);if(parsed.digest!==record.digest)throw Error('基础 APK 已被修改，请重新导入');this.baseSnapshot={key,descriptor:parsed.descriptor,digest:parsed.digest};}data.base=this.baseSnapshot.descriptor;data.baseDigest=this.baseSnapshot.digest;}catch(e){data.error=e.message;}
  await atomic(path.join(this.root,'packer-capabilities.json'),data);
 }
 async consume(){
  await this.publishCapabilities();await atomic(path.join(this.root,'packer.json'),{protocol:1,updatedAt:new Date().toISOString()});this.peer=await readPeer('theme-center',this.root);if(this.paused()){this.notifyConnection();return;}
  try{await this.catalog();this.error='';}catch(e){this.error='本机主题库：'+e.message;}
  this.store.state.localLink||={seen:[],last:null};const link=this.store.state.localLink;
  const names=(await fs.readdir(path.join(this.root,'inbox'))).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n));
  const items=[];for(const name of names){const file=path.join(this.root,'inbox',name);const stat=await fs.stat(file);items.push({name,file,time:stat.mtimeMs,size:stat.size});}items.sort((a,b)=>a.time-b.time||a.name.localeCompare(b.name));
  for(const entry of items){const id=entry.name.slice(0,-5);if(link.seen.includes(id)){if(link.last?.id===id)await atomic(path.join(this.root,'receipts',id+'.json'),link.last);continue;}if(this.paused())break;
   let result;try{
    validId(id);if(entry.size>MAX*4/3+4096)throw Error('交接文件超过限制');const item=JSON.parse(await fs.readFile(entry.file,'utf8'));
    if(item.protocol!=='hetun-local-theme'||item.version!==1||item.id!==id||typeof item.data!=='string'||item.data.length>Math.ceil(MAX/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw Error('交接协议或数据无效');
    const bytes=Buffer.from(item.data,'base64');if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('主题包校验失败');
    const parsed=parseTheme(bytes,'.zip'),manifest=parsed.manifest;
    let theme=this.store.state.themes.find(t=>t.digest===item.sha256&&t.id===manifest.id&&t.platform===manifest.platform);
    if(!theme)theme=await installTheme(this.store,bytes,'.zip','local-link');
    let target=this.store.state.apps.find(a=>a.id===this.store.state.selectedApp);if(!target)target=await this.store.create('河豚应用');
    target.profiles[theme.platform].themeId=theme.key;target.localThemeRevision=(target.localThemeRevision||0)+1;
    result={id,status:'received',name:theme.name,platform:theme.platform,themeId:theme.key,appId:target.id,appName:target.name,receivedAt:new Date().toISOString(),message:'已接收并绑定到「'+target.name+'」对应设备。'};
   }catch(e){result={id,status:'rejected',message:e.message,receivedAt:new Date().toISOString()};}
   link.seen.push(id);link.last=result;await this.store.commit();await atomic(path.join(this.root,'receipts',id+'.json'),result);this.notify?.({type:'local-theme',receipt:result});
  }
  this.notifyConnection();
 }
}
module.exports={ThemeReceiver};
