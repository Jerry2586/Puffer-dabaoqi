'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs'),{Engine}=require('../core/engine.cjs'),{installTheme}=require('../core/themes.cjs'),{generateProject}=require('../core/native-project.cjs');
test('旧来源与跨设备主题不能通过档案保存、构建检查或源码导出入口使用',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-import-only-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=await new Store(root).init(),app=await store.create('来源检查');app.profiles.mobile.android.packageName='com.test.importonly';
 const manifest={format:'hetun-skeleton',version:2,renderer:'hetun-v2',platform:'mobile',id:'source-theme',name:'来源主题',theme:{schemaVersion:2,brand:{name:'来源主题'},sections:[],navigation:[]}},bytes=Buffer.from(JSON.stringify(manifest)),engine=new Engine(store,{},()=>{});
 for(const origin of ['local-catalog','local-link','cloud',undefined]){
  const theme=await installTheme(store,bytes,'.json',origin);theme.origin=origin;app.profiles.mobile.themeId=theme.key;
  const report=await engine.inspect(app);assert.equal(report.checks.find(c=>c.name==='本机主题').ok,false);
  await assert.rejects(generateProject(store,app,path.join(root,'rejected')),/手动导入/);
  const saved=await store.save(app);assert.equal(saved.profiles.mobile.themeId,'');assert.equal(store.state.themes.find(t=>t.key===theme.key),theme);
 }
 const manual=await installTheme(store,bytes,'.json');app.profiles.mobile.themeId=manual.key;assert.equal((await store.save(app)).profiles.mobile.themeId,manual.key);assert.equal((await engine.inspect(app)).checks.find(c=>c.name==='本机主题').ok,true);
 app.profiles.tablet.themeId=manual.key;const saved=await store.save(app);assert.equal(saved.profiles.tablet.themeId,'');assert.equal(saved.profiles.mobile.themeId,manual.key);
});
