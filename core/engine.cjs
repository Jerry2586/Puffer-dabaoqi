'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {run}=require('./process.cjs');const {prepare,repack,verifyRepacked}=require('./base-apk.cjs');const {exists,androidBuildTools}=require('./services.cjs');const {runtime}=require('./runtime.cjs');
const {importedTheme}=require('./themes.cjs');
class Engine {
 constructor(store,vault,notify){this.store=store;this.vault=vault;this.notify=notify;this.active=null;}
 async inspect(a,kind='installer'){
  if(!['resources','installer'].includes(kind))throw Error('构建类型无效。');const checks=[],add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});const d=a.selectedDevice,os=a.selectedOS,p=a.profiles[d][os],s=this.store.state,t=s.settings.tools;
  add('原生平台',['android','ios','windows'].includes(os)&&!(d==='tv'&&os!=='android'),({android:'Kotlin · Android 原生',ios:'SwiftUI · iPhone / iPad',windows:'C# WPF · Windows 原生'})[os]||'不支持');
  try{runtime(a);add('应用与统一接口',true,a.backend||'未配置影视后台，仅加载已上传主题');}catch(e){add('应用与统一接口',false,e.message);}
  const theme=importedTheme(s.themes,a.profiles[d].themeId,d,a.id);add('已上传主题',theme,theme?.name||'请先为当前应用上传对应设备的主题包');
  add('二次打包类型',kind==='installer','日常打包仅接受基础安装包与主题；源码构建属于独立开发流程');
  if(os==='android'){
   if(a.backend)add('主备域名目录',!!a.serviceDirectory,a.serviceDirectory?'已验证后台身份及主备地址':'请先点击检测后台，导入签名服务地址后再打包');
   try{const prepared=await prepare(this.store,a);add('基础 APK 与主题协议',true,prepared.report.renderer+' · '+prepared.report.contract);}catch(e){add('基础 APK 与主题协议',false,e.message);}
   const bt=await androidBuildTools(t.androidHome);
   add('本机签名工具',!!bt&&await exists(path.join(bt,'zipalign.exe'))&&await exists(path.join(bt,'aapt.exe'))&&await exists(path.join(bt,'lib/apksigner.jar'))&&await exists(path.join(t.javaHome||'','bin/java.exe')),'JDK 与 Android Build Tools；二次打包无需 Gradle');
   const signature=s.signatures.find(x=>x.id===p.signatureId);add('自有签名',signature,signature?.name||'请在第三模块生成、导入或选择 JKS');
  }else add('基础安装包重打包',false,'IPA 与 EXE 的二进制重打包尚未接入，不能以源码编译冒充二次打包');
  return {kind,checks,ready:checks.every(c=>c.ok),checkedAt:new Date().toISOString()};
 }
async start(appId,kind='installer'){if(this.active)throw Error('已有任务运行，请等待或取消。');const a=structuredClone(this.store.getApp(appId)),report=await this.inspect(a,kind);if(!report.ready)throw Error(report.checks.filter(c=>!c.ok).map(c=>c.name+'：'+c.detail).join('\n'));if(this.active)throw Error('已有任务运行。');const job={id:crypto.randomUUID(),appId,name:a.name,device:a.selectedDevice,os:a.selectedOS,kind,status:'running',progress:0,stage:'准备构建',startedAt:new Date().toISOString(),version:a.profiles[a.selectedDevice][a.selectedOS].versionName,logs:[],output:'',error:''};this.store.state.history.unshift(job);const signal=new AbortController();this.active={job,signal};
 try{await this.store.commit();}catch(error){
  const index=this.store.state.history.indexOf(job);if(index!==-1)this.store.state.history.splice(index,1);
  if(this.active?.job===job)this.active=null;
  throw error;
 }
 this.perform(a,job,signal.signal).catch(()=>{});return job;}
async cancel(){if(!this.active)return;this.active.signal.abort();this.active.job.stage='正在取消';this.emit(this.active.job);}
emit(job){this.notify?.({type:'job',job:structuredClone(job)});}
async perform(a,j,signal){
 const dir=path.join(this.store.root,'builds',j.id),logFile=path.join(this.store.root,'logs',j.id+'.log');const log=s=>{j.logs.push(String(s).trim());if(j.logs.length>500)j.logs.shift();fs.appendFile(logFile,String(s)+'\n').catch(()=>{});this.emit(j);};const stage=(name,n)=>{j.stage=name;j.progress=n;this.emit(j);};
 try{
  await fs.mkdir(dir,{recursive:true});stage('读取基础 APK 与主题',10);if(signal.aborted)throw Error('任务已取消。');let output,extension;const p=a.profiles[a.selectedDevice][a.selectedOS],t=this.store.state.settings.tools;
  if(a.selectedOS==='android'){
   stage('注入主题与统一接口配置',30);const java=path.join(t.javaHome,'bin','java.exe'),unsigned=path.join(dir,'unsigned.apk');const proof=await repack(this.store,a,unsigned);j.baseDigest=proof.baseDigest;j.contract=proof.contract;j.renderer=proof.renderer;await fs.writeFile(path.join(dir,'repack-proof.json'),JSON.stringify(proof,null,2));const bt=await androidBuildTools(t.androidHome);if(!bt)throw Error('请配置 Android SDK Build Tools');const aligned=path.join(dir,'aligned.apk'),signed=path.join(dir,'signed.apk');stage('自有签名与身份校验',85);
   await run(path.join(bt,'zipalign.exe'),['-P','16','-f','4',unsigned,aligned],{signal,log});const sig=this.store.state.signatures.find(s=>s.id===p.signatureId),passwords=JSON.parse(await this.vault.get(sig.secretRef));
   await run(java,['-jar',path.join(bt,'lib/apksigner.jar'),'sign','--ks',sig.file,'--ks-key-alias',sig.alias,'--ks-pass','env:HETUN_STORE_PASS','--key-pass','env:HETUN_KEY_PASS','--out',signed,aligned],{env:{HETUN_STORE_PASS:passwords.password,HETUN_KEY_PASS:passwords.keyPassword},signal,log,secrets:[passwords.password,passwords.keyPassword]});
   const verify=await run(java,['-jar',path.join(bt,'lib/apksigner.jar'),'verify','--verbose','--print-certs',signed],{signal,log});if(!verify.replaceAll(':','').toLowerCase().includes(sig.fingerprint.replaceAll(':','').toLowerCase()))throw Error('APK 签名指纹不匹配');const badging=await run(path.join(bt,'aapt.exe'),['dump','badging',signed],{signal,log});if(!badging.includes("name='"+p.packageName+"'")||!badging.includes("versionCode='"+p.versionCode+"'")||!badging.includes("versionName='"+p.versionName+"'"))throw Error('APK 包名或版本不匹配');output=await fs.readFile(signed);verifyRepacked(output,proof);await run(path.join(bt,'zipalign.exe'),['-c','-P','16','4',signed],{signal,log});extension='.apk';
  }else throw Error('当前系统尚未接入基础安装包重打包');
  if(signal.aborted)throw Error('任务已取消。');const filename=(a.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'hetun')+'-'+a.selectedDevice+'-'+a.selectedOS+'-'+p.versionName+'-'+j.id.slice(0,8)+extension;j.output=path.join(this.store.root,'outputs',filename);await fs.writeFile(j.output,output);j.sha256=crypto.createHash('sha256').update(output).digest('hex');j.bytes=output.length;j.status='complete';j.stage='基础 APK 二次打包完成';j.progress=100;log('产物 SHA-256：'+j.sha256);
 }catch(e){j.status=signal.aborted?'cancelled':'failed';j.error=e.message;j.stage=signal.aborted?'任务已取消':'构建失败';log(j.error);}finally{j.finishedAt=new Date().toISOString();this.active=null;await this.store.commit();this.emit(j);}
 }
}
module.exports={Engine};
