'use strict';
const {seedLegacyTheme}=require('./fixtures/legacy-theme.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs'),{redactedApp,normalizeApp,newApp}=require('../core/domain.cjs');
const {importThemeForProfile,removeThemeForProfile,importedTheme}=require('../core/themes.cjs');
const manifest=(device='mobile',name='上传主题')=>({format:'hetun-skeleton',version:2,renderer:'hetun-v2',platform:device,id:'upload-theme',name,theme:{schemaVersion:2,brand:{name},sections:[],navigation:[]}});
const input=(a,device='mobile',extra={})=>({appId:a.id,device,fileName:'主题.json',content:Buffer.from(JSON.stringify(manifest(device))).toString('base64'),...extra});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-theme-upload-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=await new Store(root).init(),app=await store.create('上传应用');return {root,store,app};}
test('点击与拖拽的文件入口均直接绑定捕获的应用设备，重启保留',async t=>{
 const {root,store,app}=await fixture(t),file=path.join(root,'手动主题.json');await fs.writeFile(file,JSON.stringify(manifest()));
 let choose;const pending=importThemeForProfile(store,{appId:app.id,device:'mobile',expectedKey:''},()=>new Promise(r=>choose=r));
 const changed=structuredClone(app);changed.selectedDevice='tablet';await store.save(changed);choose(file);
 const first=await pending;assert.equal(first.appId,app.id);assert.equal(store.getApp(app.id).profiles.mobile.themeId,first.key);assert.equal(store.getApp(app.id).profiles.tablet.themeId,'');
 const second=await importThemeForProfile(store,{appId:app.id,device:'tablet',filePath:await (async()=>{const f=path.join(root,'平板.json');await fs.writeFile(f,JSON.stringify(manifest('tablet')));return f;})()});
 assert.equal(store.getApp(app.id).profiles.tablet.themeId,second.key);assert.equal(first.fileName,'手动主题.json');
 const reboot=await new Store(root).init();assert.equal(reboot.getApp(app.id).profiles.mobile.themeId,first.key);
});
test('取消、格式错误、设备不匹配和过大主题均保持当前主题及状态',async t=>{
 const {root,store,app}=await fixture(t),theme=await importThemeForProfile(store,input(app)),before=JSON.stringify(store.state);
 assert.equal(await importThemeForProfile(store,{appId:app.id,device:'mobile'},async()=>null),null);
 for(const bad of [input(app,'tv',{device:'mobile'}),input(app,'mobile',{fileName:'theme.exe'}),input(app,'mobile',{content:'%%%'}),input(app,'mobile',{filePath:path.join(root,'ignored.json')}),input(app,'mobile',{content:Buffer.from('{}').toString('base64')}),input(app,'mobile',{content:'A'.repeat(16*1024*1024+4)})])await assert.rejects(importThemeForProfile(store,bad));
 const dir=path.join(root,'folder.json');await fs.mkdir(dir);await assert.rejects(importThemeForProfile(store,{appId:app.id,device:'mobile',filePath:dir}));
 assert.equal(JSON.stringify(store.state),before);assert.equal(store.getApp(app.id).profiles.mobile.themeId,theme.key);
});
test('复制、档案导出与重导入不继承主题，伪造其它应用主题无法生效',async t=>{
 const {store,app}=await fixture(t),theme=await importThemeForProfile(store,input(app)),other=await store.create('另一个应用');
 const forged=structuredClone(other);forged.profiles.mobile.themeId=theme.key;forged.profiles.mobile.uploadedTheme={key:theme.key};
 assert.equal((await store.save(forged)).profiles.mobile.themeId,'');assert.equal(importedTheme(store.state.themes,theme.key,'mobile',other.id),undefined);
 assert.equal((await store.duplicate(app.id)).profiles.mobile.themeId,'');
 const archive=redactedApp(store.getApp(app.id));for(const p of Object.values(archive.profiles)){assert.equal(p.themeId,'');assert.equal(Object.hasOwn(p,'uploadedTheme'),false);}
 const fresh=newApp('重导入');assert.equal(normalizeApp({...archive,id:fresh.id},fresh).profiles.mobile.themeId,'');
});
test('旧手动记录保留但不自动使用，空面板重新上传不被历史引用阻止',async t=>{
 const {root,store,app}=await fixture(t),old=await seedLegacyTheme(store,Buffer.from(JSON.stringify(manifest())),'.json');app.profiles.mobile.themeId=old.key;await store.commit();
 const current=await importThemeForProfile(store,input(app,'mobile',{expectedKey:''}));assert.notEqual(current.key,old.key);assert.equal(app.profiles.mobile.themeId,current.key);
 assert.equal(store.state.themes.length,2);assert.ok((await fs.stat(path.join(root,'themes',old.key,'theme.zip'))).size>0);
});
test('替换与移除拒绝过期操作，移除后不能通过保存旧档案重新激活',async t=>{
 const {root,store,app}=await fixture(t),first=await importThemeForProfile(store,input(app)),stale=structuredClone(app);
 const next=await importThemeForProfile(store,input(app,'mobile',{expectedKey:first.key}));
 await assert.rejects(importThemeForProfile(store,input(app,'mobile',{expectedKey:first.key})),/变化/);
 await assert.rejects(removeThemeForProfile(store,{appId:app.id,device:'mobile',key:first.key}),/变化/);
 assert.equal(app.profiles.mobile.themeId,next.key);await removeThemeForProfile(store,{appId:app.id,device:'mobile',key:next.key});
 assert.equal((await store.save(stale)).profiles.mobile.themeId,'');assert.equal(store.state.themes.length,2);
 assert.ok((await fs.stat(path.join(root,'themes',next.key,'theme.zip'))).size>0);
});
test('提交失败回滚上传及移除，选择文件时删除应用不能复活或写入其它应用',async t=>{
 const {root,store,app}=await fixture(t),first=await importThemeForProfile(store,input(app)),before=JSON.stringify(store.state),commit=store.commit.bind(store);
 store.commit=async()=>{throw Error('disk full');};await assert.rejects(importThemeForProfile(store,input(app)),/disk full/);assert.equal(JSON.stringify(store.state),before);assert.deepEqual(await fs.readdir(path.join(root,'themes')),[first.key]);
 await assert.rejects(removeThemeForProfile(store,{appId:app.id,device:'mobile',key:first.key}),/disk full/);assert.equal(JSON.stringify(store.state),before);store.commit=commit;
 const file=path.join(root,'待选主题.json');await fs.writeFile(file,JSON.stringify(manifest()));let choose;
 const pending=importThemeForProfile(store,{appId:app.id,device:'mobile'},()=>new Promise(r=>choose=r));await store.remove(app.id);const other=await store.create('保留应用');choose(file);
 await assert.rejects(pending,/应用不存在/);assert.equal(store.state.apps.length,1);assert.equal(other.profiles.mobile.themeId,'');
});
test('并发替换只允许一个预期版本成功',async t=>{
 const {store,app}=await fixture(t),first=await importThemeForProfile(store,input(app));
 const results=await Promise.allSettled([importThemeForProfile(store,input(app,'mobile',{expectedKey:first.key})),importThemeForProfile(store,input(app,'mobile',{expectedKey:first.key}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(store.state.themes.length,2);
});
