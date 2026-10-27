'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
const {applicationFiles}=require('../scripts/package-files.cjs');
test('发行目录独立保存应用并生成运行配置，包含所有本地模块依赖',async()=>{
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-distribution-'));
 try{
  for(const file of applicationFiles){const target=path.join(stage,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(__dirname,'..',file),target);}
  const req=createRequire(path.join(stage,'package.json'));
  for(const file of applicationFiles.filter(f=>f.startsWith('core/')&&f.endsWith('.cjs'))){const source=await fs.readFile(path.join(stage,file),'utf8');for(const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const target=path.resolve(stage,path.dirname(file),match[1]);assert.ok(applicationFiles.some(f=>path.resolve(stage,f)===target),'发行遗漏依赖 '+file+' → '+match[1]);}}
  const {newApp,normalizeApp}=req('./core/domain.cjs'),{runtime}=req('./core/runtime.cjs');
  const app=newApp('发行验证');app.profiles.mobile.android.packageName='com.test.distribution';Object.assign(app.advanced,{scheme:'hetun',host:'open',channel:'release'});
  const config=runtime(normalizeApp(app,app));assert.equal(config.advanced.scheme,'hetun');assert.equal(config.advanced.channel,'release');
 }finally{await fs.rm(stage,{recursive:true,force:true});}
});
