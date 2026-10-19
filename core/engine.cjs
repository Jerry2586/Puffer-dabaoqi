'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {run}=require('./process.cjs');const {exists,jsonRequest}=require('./services.cjs');const {directoryEntries,makeZip}=require('./zip.cjs');const {generateProject,readProject,runtime,copyTree}=require('./native-project.cjs');
class Engine {
 constructor(store,vault,notify){this.store=store;this.vault=vault;this.notify=notify;this.active=null;}
 async inspect(a,kind='resources'){
  if(!['resources','installer'].includes(kind))throw Error('构建类型无效。');const checks=[],add=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});const d=a.selectedDevice,os=a.selectedOS,p=a.profiles[d][os],s=this.store.state,t=s.settings.tools;
  add('原生平台',['android','ios','windows'].includes(os)&&!(d==='tv'&&os!=='android'),({android:'Kotlin · Android 原生',ios:'SwiftUI · iPhone / iPad',windows:'C# WPF · Windows 原生'})[os]||'不支持');
  try{runtime(a);add('应用与统一接口',true,a.backend||'离线主题预览，暂不连接影视后台');}catch(e){add('应用与统一接口',false,e.message);}
  const theme=s.themes.find(x=>x.key===a.profiles[d].themeId&&x.platform===d);add('本机主题',theme,theme?.name||'接收或导入对应设备主题');
  if(a.source){try{await readProject(a.source,os);add('原生源码',true,a.source);}catch(e){add('原生源码',false,e.message);}}else add('客户端源码',false,'请先导入客户端源码目录或源码 ZIP。');
  if(kind==='installer'&&os==='android'){
   add('Java / Android SDK',await exists(path.join(t.javaHome||'','bin','java.exe'))&&await exists(path.join(t.androidHome||'','platforms','android-36','android.jar')), 'JDK 21 与 Android SDK 36');
   add('Gradle 原生编译器',await exists(path.join(t.gradleHome||'','bin','gradle.bat')),'Gradle 9.8.1；离线构建使用本机依赖缓存');
   const signature=s.signatures.find(x=>x.id===p.signatureId);add('自有签名',signature,signature?.name||'在设置中生成或导入 JKS');
  }else if(kind==='installer'&&os==='windows')add('WPF 构建环境',process.platform==='win32'&&await exists(t.dotnet),'本机 .NET 10 SDK；产物需要 .NET 10 Desktop Runtime');
  else if(kind==='installer'&&os==='ios'){
   add('Apple Team ID',/^[A-Z0-9]{10}$/.test(p.teamId||''),'填写自己的 Apple 开发团队 ID');
   try{const mac=s.settings.mac;if(!mac.url||!mac.keyRef)throw Error('配置自己的局域网 Mac 节点后可构建 IPA，也可先离线导出 Swift 工程。');const h=await jsonRequest(mac.url+'/v1/health',{headers:{Authorization:'Bearer '+await this.vault.get(mac.keyRef)}});add('原生 Mac 节点',h.service==='hetun-mac-agent'&&h.version===2&&h.ready&&h.devices?.includes(d),h.message||'节点需要支持 hetun-runtime-v1');}catch(e){add('原生 Mac 节点',false,e.message);}
  }
  return {kind,checks,ready:checks.every(c=>c.ok),checkedAt:new Date().toISOString()};
 }
async start(appId,kind){if(this.active)throw Error('已有任务运行，请等待或取消。');const a=structuredClone(this.store.getApp(appId)),report=await this.inspect(a,kind);if(!report.ready)throw Error(report.checks.filter(c=>!c.ok).map(c=>c.name+'：'+c.detail).join('\n'));if(this.active)throw Error('已有任务运行。');const job={id:crypto.randomUUID(),appId,name:a.name,device:a.selectedDevice,os:a.selectedOS,kind,status:'running',progress:0,stage:'准备构建',startedAt:new Date().toISOString(),version:a.profiles[a.selectedDevice][a.selectedOS].versionName,logs:[],output:'',error:''};this.store.state.history.unshift(job);const signal=new AbortController();this.active={job,signal};await this.store.commit();this.perform(a,job,signal.signal).catch(()=>{});return job;}
async cancel(){if(!this.active)return;this.active.signal.abort();this.active.job.stage='正在取消';this.emit(this.active.job);}
emit(job){this.notify?.({type:'job',job:structuredClone(job)});}
async perform(a,j,signal){
 const dir=path.join(this.store.root,'builds',j.id),native=path.join(dir,'native'),logFile=path.join(this.store.root,'logs',j.id+'.log');const log=s=>{j.logs.push(String(s).trim());if(j.logs.length>500)j.logs.shift();fs.appendFile(logFile,String(s)+'\n').catch(()=>{});this.emit(j);};const stage=(name,n)=>{j.stage=name;j.progress=n;this.emit(j);};
 try{
  await fs.mkdir(dir,{recursive:true});stage('生成原生工程与主题',10);await generateProject(this.store,a,native);if(signal.aborted)throw Error('任务已取消。');let output,extension;const p=a.profiles[a.selectedDevice][a.selectedOS],t=this.store.state.settings.tools;
  if(j.kind==='resources'){stage('导出可二次编译的原生源码',85);output=makeZip(await directoryEntries(native));extension='.native-source.zip';}
  else if(a.selectedOS==='android'){
   stage('Kotlin / Gradle 离线编译',30);const java=path.join(t.javaHome,'bin','java.exe');await fs.writeFile(path.join(native,'local.properties'),'sdk.dir='+t.androidHome.replaceAll('\\','/')+'\n');
   await run(java,['-cp',path.join(t.gradleHome,'lib','*'),'org.gradle.launcher.GradleMain',':app:assembleRelease','--offline','--no-daemon'],{cwd:native,env:{JAVA_HOME:t.javaHome,ANDROID_HOME:t.androidHome,ANDROID_SDK_ROOT:t.androidHome,GRADLE_USER_HOME:t.gradleUserHome||path.join(process.env.USERPROFILE||'','.gradle')},signal,timeout:900000,log});
   const unsigned=path.join(native,'app/build/outputs/apk/release/app-release-unsigned.apk');if(!await exists(unsigned))throw Error('Gradle 没有生成未签名 APK');const versions=(await fs.readdir(path.join(t.androidHome,'build-tools'))).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));const bt=path.join(t.androidHome,'build-tools',versions[0]),aligned=path.join(dir,'aligned.apk'),signed=path.join(dir,'signed.apk');stage('自有签名与身份校验',85);
   await run(path.join(bt,'zipalign.exe'),['-f','-p','4',unsigned,aligned],{signal,log});const sig=this.store.state.signatures.find(s=>s.id===p.signatureId),passwords=JSON.parse(await this.vault.get(sig.secretRef));
   await run(java,['-jar',path.join(bt,'lib/apksigner.jar'),'sign','--ks',sig.file,'--ks-key-alias',sig.alias,'--ks-pass','env:HETUN_STORE_PASS','--key-pass','env:HETUN_KEY_PASS','--out',signed,aligned],{env:{HETUN_STORE_PASS:passwords.password,HETUN_KEY_PASS:passwords.keyPassword},signal,log,secrets:[passwords.password,passwords.keyPassword]});
   const verify=await run(java,['-jar',path.join(bt,'lib/apksigner.jar'),'verify','--verbose','--print-certs',signed],{signal,log});if(!verify.replaceAll(':','').toLowerCase().includes(sig.fingerprint.replaceAll(':','').toLowerCase()))throw Error('APK 签名指纹不匹配');const badging=await run(path.join(bt,'aapt.exe'),['dump','badging',signed],{signal,log});if(!badging.includes("name='"+p.packageName+"'")||!badging.includes("versionCode='"+p.versionCode+"'")||!badging.includes("versionName='"+p.versionName+"'"))throw Error('APK 包名或版本不匹配');output=await fs.readFile(signed);extension='.apk';
  }else if(a.selectedOS==='windows'){
   stage('C# WPF 离线构建',40);const nuget=path.join(dir,'NuGet.Config');await fs.writeFile(nuget,'<configuration><packageSources><clear /></packageSources></configuration>');
   await run(t.dotnet,['publish','Hetun.csproj','-c','Release','-r','win-x64','--self-contained','false','-p:PublishSingleFile=true','-p:SelfContained=false','-p:EnableSingleFileAnalyzer=false','-p:EnableTrimAnalyzer=false','-p:EnableAotAnalyzer=false','-p:Version='+p.versionName,'-p:AssemblyVersion='+p.versionName.split(/[.-]/).slice(0,3).join('.')+'.0','-p:NuGetAudit=false','--configfile',nuget,'-o',path.join(dir,'published')],{cwd:native,env:{DOTNET_ROOT:path.dirname(t.dotnet),DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1'},timeout:600000,signal,log});output=await fs.readFile(path.join(dir,'published/HetunClient.exe'));if(output[0]!==77||output[1]!==90)throw Error('Windows 产物不是有效 EXE');extension='.exe';
  }else{
   stage('发送至自有 Mac 原生节点',30);const mac=this.store.state.settings.mac,headers={Authorization:'Bearer '+await this.vault.get(mac.keyRef),'Content-Type':'application/json'};const task=await jsonRequest(mac.url+'/v1/jobs',{method:'POST',headers,signal,body:JSON.stringify({contract:'hetun-runtime-v1',project:makeZip(await directoryEntries(native)).toString('base64'),config:{device:a.selectedDevice,packageName:p.packageName,versionName:p.versionName,versionCode:p.versionCode,teamId:p.teamId}})});if(!/^[a-f0-9-]{36}$/.test(task.id||''))throw Error('Mac 节点返回无效任务标识');let result;
   try{for(let n=0;n<900;n++){if(signal.aborted)throw Error('任务已取消。');result=await jsonRequest(mac.url+'/v1/jobs/'+task.id,{headers,signal});if(result.status==='failed')throw Error(result.error||'Mac 编译失败');if(result.status==='complete')break;stage(result.stage||'Xcode 构建',Math.min(95,30+Number(result.progress||0)*0.65));await new Promise(r=>setTimeout(r,1000));}if(result?.status!=='complete')throw Error('Mac 构建超时');const response=await fetch(mac.url+'/v1/jobs/'+task.id+'/artifact',{headers,signal,redirect:'error'});if(!response.ok)throw Error('IPA 下载失败');output=Buffer.from(await response.arrayBuffer());if(!output.length||crypto.createHash('sha256').update(output).digest('hex')!==result.sha256)throw Error('IPA 摘要不匹配');extension='.ipa';}finally{if(signal.aborted)await fetch(mac.url+'/v1/jobs/'+task.id,{method:'DELETE',headers,signal:AbortSignal.timeout(5000)}).catch(()=>{});}
  }
  if(signal.aborted)throw Error('任务已取消。');const filename=(a.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'hetun')+'-'+a.selectedDevice+'-'+a.selectedOS+'-'+p.versionName+'-'+j.id.slice(0,8)+extension;j.output=path.join(this.store.root,'outputs',filename);await fs.writeFile(j.output,output);j.sha256=crypto.createHash('sha256').update(output).digest('hex');j.bytes=output.length;j.status='complete';j.stage=j.kind==='resources'?'原生源码工程已导出':'原生安装包构建完成';j.progress=100;log('产物 SHA-256：'+j.sha256);
 }catch(e){j.status=signal.aborted?'cancelled':'failed';j.error=e.message;j.stage=signal.aborted?'任务已取消':'构建失败';log(j.error);}finally{j.finishedAt=new Date().toISOString();this.active=null;await this.store.commit();this.emit(j);}
 }
}
module.exports={Engine,copyTree};
