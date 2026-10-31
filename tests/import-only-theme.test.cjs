'use strict';
const {seedLegacyTheme}=require('./fixtures/legacy-theme.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs'),{Engine}=require('../core/engine.cjs'),{importThemeForProfile}=require('../core/themes.cjs'),{generateProject}=require('../core/native-project.cjs');
const bytes=Buffer.from(JSON.stringify({format:'hetun-skeleton',version:2,renderer:'hetun-v2',platform:'mobile',id:'manual-theme',name:'手动主题',theme:{schemaVersion:2,brand:{name:'手动主题'},sections:[],navigation:[]}}));
test('历史同步及无归属手动主题均不能被旧引用或保存激活，重新上传立即可用',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-upload-only-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=await new Store(root).init(),app=await store.create('上传隔离'),engine=new Engine(store,{});app.profiles.mobile.android.packageName='com.test.upload';
 for(const origin of ['local-catalog','local-link','cloud','import',undefined]){
  const theme=await seedLegacyTheme(store,bytes,'.json',origin);theme.origin=origin;store.getApp(app.id).profiles.mobile.themeId=theme.key;app.profiles.mobile.themeId=theme.key;
  assert.equal((await engine.inspect(app)).checks.find(c=>c.name==='已上传主题').ok,false);
  await assert.rejects(generateProject(store,app,path.join(root,'rejected')),/上传/);
  const saved=await store.save(app);assert.equal(saved.profiles.mobile.themeId,'');assert.equal(store.state.themes.find(t=>t.key===theme.key),theme);
  assert.ok((await fs.stat(path.join(root,'themes',theme.key,'theme.zip'))).size>0);
 }
 const manual=await importThemeForProfile(store,{appId:app.id,device:'mobile',fileName:'theme.json',content:bytes.toString('base64')});
 const saved=await store.save(store.getApp(app.id));assert.equal(saved.profiles.mobile.themeId,manual.key);
 assert.equal((await engine.inspect(saved)).checks.find(c=>c.name==='已上传主题').ok,true);
 const forged=structuredClone(saved);forged.profiles.tablet.themeId=manual.key;
 assert.equal((await store.save(forged)).profiles.tablet.themeId,'');
});
