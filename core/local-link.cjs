'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const MAX=12*1024*1024;
function linkRoot(){return process.env.HETUN_LOCAL_LINK_ROOT||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'Programs','UniAppTools','local-link');}
function validId(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('本机交接编号无效');return id;}
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(data),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}}
async function queueTheme(bundle,root=linkRoot()){
 if(typeof bundle.data!=='string'||bundle.data.length>Math.ceil(MAX/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(bundle.data))throw Error('主题包数据无效或超过12MB');
 const bytes=Buffer.from(bundle.data,'base64');if(!bytes.length||bytes.length>MAX)throw Error('主题包大小无效');
 const item={protocol:'hetun-local-theme',version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),name:String(bundle.name||'theme.zip').slice(0,100),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')};
 await atomic(path.join(root,'inbox',item.id+'.json'),item);return readStatus(item.id,root);
}
async function readStatus(id,root=linkRoot()){
 if(!id){const peer=await readPeer('packer',root);return {online:!!peer,connected:!!peer,message:peer?'已连接本机打包器':'等待本机打包器启动'};}
 validId(id);try{const file=path.join(root,'receipts',id+'.json');if((await fs.stat(file)).size>16000)throw Error('回执过大');return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let online=false;try{const live=JSON.parse(await fs.readFile(path.join(root,'packer.json'),'utf8'));online=Date.now()-Date.parse(live.updatedAt)<8000;}catch{}
 return {id,status:'queued',online,message:online?'已进入本机队列，打包器正在接收。':'已保存到本机队列；打开打包器后自动接收。'};
}
async function readPeer(role,root=linkRoot(),now=Date.now()){
 if(!['packer','theme-center'].includes(role))throw Error('本机软件标识无效');
 try{const file=path.join(root,role+'.json');if((await fs.stat(file)).size>4096)return null;const peer=JSON.parse(await fs.readFile(file,'utf8')),age=now-Date.parse(peer.updatedAt);return peer.protocol===1&&Number.isFinite(age)&&age>=0&&age<8000?peer:null;}catch{return null;}
}
module.exports={MAX,linkRoot,validId,atomic,queueTheme,readStatus,readPeer};
