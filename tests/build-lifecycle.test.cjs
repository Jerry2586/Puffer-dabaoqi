'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {androidBuildTools}=require('../core/services.cjs');
const {Engine}=require('../core/engine.cjs'),{newApp}=require('../core/domain.cjs');
test('构建工具解析处理未配置、缺失、空目录并按数值选择版本，忽略普通文件',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-build-tools-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 assert.equal(await androidBuildTools(''),'');assert.equal(await androidBuildTools(root),'');
 const tools=path.join(root,'build-tools');await fs.mkdir(tools);assert.equal(await androidBuildTools(root),'');
 await fs.mkdir(path.join(tools,'9.0.0'));await fs.mkdir(path.join(tools,'10.0.0'));await fs.writeFile(path.join(tools,'99.0.0'),'not a directory');
 assert.equal(await androidBuildTools(root),path.join(tools,'10.0.0'));
});
test('构建启动提交失败会释放锁并撤销本次记录，保留其它记录且允许重试',async()=>{
 const app=newApp('重试应用'),previous={id:'previous',status:'complete'},unrelated={id:'unrelated',status:'complete'};
 let commits=0,performed=0;
 const store={state:{history:[previous]},getApp:()=>app,commit:async()=>{if(++commits===1){store.state.history.push(unrelated);throw Error('disk full');}}};
 const engine=new Engine(store,{});engine.inspect=async()=>({ready:true});engine.perform=async()=>{performed++;};
 await assert.rejects(engine.start(app.id),/disk full/);assert.equal(engine.active,null);assert.equal(performed,0);
 assert.deepEqual(store.state.history,[previous,unrelated]);
 const job=await engine.start(app.id);assert.equal(job.status,'running');assert.equal(performed,1);
 assert.equal(engine.active.job,job);assert.deepEqual(store.state.history,[job,previous,unrelated]);
});
