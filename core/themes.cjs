const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const {readZip,makeZip}=require('./zip.cjs');const {DEVICES}=require('./domain.cjs');
function validateTheme(m,files=new Map()){if(!m||m.format!=='hetun-skeleton'||m.version!==2||m.renderer!=='hetun-v2')throw Error('仅支持河豚骨架 v2 主题包。');if(m.platform==='web')m={...m,platform:'desktop'};if(!DEVICES.includes(m.platform))throw Error('打包器支持手机、平板、电视、电脑版主题。');if(!/^[a-z0-9][a-z0-9-]{2,60}$/.test(m.id||'')||typeof m.name!=='string'||!m.name.trim()||m.name.length>80)throw Error('主题标识或名称不正确。');if(!m.theme||![1,2].includes(m.theme.schemaVersion)||!m.theme.brand||!Array.isArray(m.theme.sections)||!Array.isArray(m.theme.navigation))throw Error('主题内容缺失或结构不兼容。');let total=0;for(const[n,b]of files){if(n==='manifest.json')continue;if(!/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpg|jpeg|webp|mp4)$/i.test(n))throw Error('主题包只允许 manifest.json 和图片/视频素材。');total+=b.length;}if(total>16*1024*1024||files.size>80)throw Error('主题素材超过限制。');const packaging=require('./package-contract.cjs').requirements(m);function verifyAssets(value){if(typeof value==='string'&&value.startsWith('assets/')&&!files.has(value))throw Error('主题引用素材不存在：'+value);if(Array.isArray(value))value.forEach(verifyAssets);else if(value&&typeof value==='object')Object.values(value).forEach(verifyAssets);}verifyAssets(m.theme);return {...m,packaging,name:m.name.trim()};}
function parseTheme(buffer,extension){if(buffer.length>MAX_THEME_BYTES)throw Error('主题包最大 12MB。');let files,m;if(extension.toLowerCase()==='.zip'){files=readZip(buffer);if(!files.has('manifest.json'))throw Error('主题包根目录缺少 manifest.json。');m=JSON.parse(files.get('manifest.json'));}else{m=JSON.parse(buffer.toString('utf8'));files=new Map();for(const[n,b]of Object.entries(m.assets||{})){if(typeof b!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(b))throw Error('主题素材编码无效。');files.set(n,Buffer.from(b,'base64'));}delete m.assets;files.set('manifest.json',Buffer.from(JSON.stringify(m)));}m=validateTheme(m,files);files.set('manifest.json',Buffer.from(JSON.stringify(m)));return {manifest:m,files};}
const MAX_THEME_BYTES=12*1024*1024;
const mutations=new WeakMap();
function mutate(store,operation){const next=(mutations.get(store)||Promise.resolve()).catch(()=>{}).then(operation);mutations.set(store,next);return next;}
async function themeRecord(store,buffer,parsed,appId,fileName){
 const {manifest:m,files}=parsed,key=crypto.randomUUID(),archive=makeZip(files);
 const dir=path.join(store.root,'themes',key);await fs.mkdir(dir);
 try{await fs.writeFile(path.join(dir,'theme.zip'),archive,{flag:'wx'});}
 catch(error){await fs.unlink(path.join(dir,'theme.zip')).catch(()=>{});await fs.rmdir(dir).catch(()=>{});throw error;}
 return {key,id:m.id,name:m.name,platform:m.platform,renderer:m.renderer,digest:crypto.createHash('sha256').update(buffer).digest('hex'),origin:'import',appId,fileName,installedAt:new Date().toISOString()};
}
function importedTheme(themes,key,device,appId){return appId?themes.find(t=>t.origin==='import'&&t.appId===appId&&t.key===key&&t.platform===device):undefined;}
function clearUnavailableThemeBindings(app,themes){for(const d of DEVICES){const profile=app.profiles?.[d];if(profile?.themeId&&!importedTheme(themes,profile.themeId,d,app.id))profile.themeId='';delete profile?.uploadedTheme;}return app;}
function targetProfile(store,input){const app=store.getApp(input.appId);if(!DEVICES.includes(input.device)||!app.profiles?.[input.device])throw Error('请选择上传主题的设备');return {app,profile:app.profiles[input.device]};}
async function importThemeForProfile(store,input={},pick){
 targetProfile(store,input);let bytes,fileName;
 if(Object.hasOwn(input,'content')){
  if(Object.hasOwn(input,'filePath')||typeof input.fileName!=='string')throw Error('主题上传参数无效');
  if(typeof input.content!=='string'||input.content.length>4*Math.ceil(MAX_THEME_BYTES/3)||!input.content||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.content))throw Error('主题上传内容无效或超过 12MB');
  bytes=Buffer.from(input.content,'base64');if(bytes.toString('base64')!==input.content)throw Error('主题上传编码无效');fileName=path.basename(input.fileName);
 }else{
  const file=Object.hasOwn(input,'filePath')?input.filePath:await pick();if(!file)return null;
  if(typeof file!=='string'||!path.isAbsolute(file))throw Error('请选择本地主题文件');fileName=path.basename(file);
  if(!/\.(zip|json)$/i.test(fileName))throw Error('请选择 .zip 或 .json 主题文件');
  const handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile())throw Error('请选择主题文件，不能上传文件夹');if(stat.size>MAX_THEME_BYTES)throw Error('主题包最大 12MB。');bytes=await handle.readFile();}finally{await handle.close();}
 }
 if(!/\.(zip|json)$/i.test(fileName))throw Error('请选择 .zip 或 .json 主题文件');
 const parsed=parseTheme(bytes,path.extname(fileName));if(parsed.manifest.platform!==input.device)throw Error('主题设备不匹配，请上传当前设备的主题包');
 return mutate(store,async()=>{
  let {app,profile}=targetProfile(store,input);const previous=profile.themeId||'';
  const effectiveKey=importedTheme(store.state.themes,previous,input.device,app.id)?previous:'';
  if(Object.hasOwn(input,'expectedKey')&&input.expectedKey!==effectiveKey)throw Error('当前主题已发生变化，请刷新后重新上传');
  const theme=await themeRecord(store,bytes,parsed,input.appId,fileName);
  try{
   ({app,profile}=targetProfile(store,input));
   if((profile.themeId||'')!==previous)throw Error('当前主题已发生变化，请刷新后重新上传');
   const updatedAt=app.updatedAt;store.state.themes.push(theme);profile.themeId=theme.key;app.updatedAt=new Date().toISOString();
   try{await store.commit();}catch(error){store.state.themes=store.state.themes.filter(t=>t.key!==theme.key);profile.themeId=previous;app.updatedAt=updatedAt;throw error;}
   return theme;
  }catch(error){
   // Remove only the fresh staged file; retained historical themes are untouched.
   const staged=path.join(store.root,'themes',theme.key);
   await fs.unlink(path.join(staged,'theme.zip')).catch(()=>{});await fs.rmdir(staged).catch(()=>{});throw error;
  }
 });
}
async function removeThemeForProfile(store,input={}){return mutate(store,async()=>{
 const {app,profile}=targetProfile(store,input),theme=importedTheme(store.state.themes,profile.themeId,input.device,app.id);
 if(!theme||theme.key!==input.key)throw Error('当前上传主题已变化，请刷新后再移除');
 const updatedAt=app.updatedAt;profile.themeId='';app.updatedAt=new Date().toISOString();
 try{await store.commit();}catch(error){profile.themeId=theme.key;app.updatedAt=updatedAt;throw error;}
 return true;
});}
module.exports={validateTheme,parseTheme,importedTheme,clearUnavailableThemeBindings,importThemeForProfile,removeThemeForProfile};
