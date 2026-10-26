'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 let resolveCheck,rejectCheck,resolveSave,saved;const elements=new Map();for(const key of ['#backendResult','#toast','[data-path="backend"]','[data-action="backend"]'])elements.set(key,{innerHTML:'',value:'',classList:{add(){},remove(){}}});
 const initial={selectedApp:'app',apps:[{id:'app',selectedDevice:'tv',backend:'https://ops.example/api/service-directory'}]};
 const result={base:'https://ops.example',serviceDirectory:{payload:'signed'},ok:true,connectionOK:true,checkedAt:new Date().toISOString(),checks:[]};
 const api={state:()=>new Promise(()=>{}),onEvent(){},checkBackend:()=>new Promise((r,j)=>{resolveCheck=r;rejectCheck=j;}),save:value=>{saved=structuredClone(value);return new Promise(r=>{resolveSave=()=>r({...initial,apps:[saved]});});}};
 const context=vm.createContext({window:{packer:api},document:{querySelector:s=>elements.get(s)||null,addEventListener(){}},setTimeout:()=>0,clearTimeout(){},initial,structuredClone});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),context);vm.runInContext('state=structuredClone(initial)',context);
 return {context,elements,result,check:()=>resolveCheck(result),fail:e=>rejectCheck(e),saved:()=>saved,finishSave:()=>resolveSave()};
}
test('后台检测等待期间状态刷新后，结果保存到当前应用对象',async()=>{
 const f=setup();const pending=vm.runInContext("action('backend',{})",f.context);vm.runInContext('state=structuredClone(state)',f.context);f.check();await new Promise(r=>setImmediate(r));
 assert.equal(f.saved().backend,f.result.base);assert.deepEqual(f.saved().serviceDirectory,f.result.serviceDirectory);f.finishSave();await pending;
});
test('保存后台检测结果时切离工作台，完成后不操作已移除报告节点',async()=>{
 const f=setup();const pending=vm.runInContext("action('backend',{})",f.context);f.check();await new Promise(r=>setImmediate(r));f.elements.delete('#backendResult');f.finishSave();await pending;
});

test('接入请求失败后清除检测中、展示错误并恢复重试',async()=>{const f=setup();const pending=vm.runInContext("action('backend',{})",f.context);assert.equal(f.elements.get('[data-action="backend"]').disabled,true);f.fail(Error('域名不可达'));await pending;assert.match(f.elements.get('#backendResult').innerHTML,/域名不可达/);assert.doesNotMatch(f.elements.get('#backendResult').innerHTML,/正在检测/);assert.equal(f.elements.get('[data-action="backend"]').disabled,false);assert.equal(f.saved(),undefined);});
test('工作台重绘后保留检测进度、阻止重复请求并保留结果',async()=>{const f=setup();const pending=vm.runInContext("action('backend',{})",f.context);f.elements.set('#backendResult',{innerHTML:''});vm.runInContext('refreshBackendStatus()',f.context);assert.match(f.elements.get('#backendResult').innerHTML,/正在检测/);await vm.runInContext("action('backend',{})",f.context);f.check();await new Promise(r=>setImmediate(r));f.finishSave();await pending;f.elements.set('#backendResult',{innerHTML:''});vm.runInContext('refreshBackendStatus()',f.context);assert.match(f.elements.get('#backendResult').innerHTML,/列出的接口检测通过/);assert.doesNotMatch(f.elements.get('#backendResult').innerHTML,/正在检测/);});
test('切换应用或更换地址后不把旧请求结果写入当前档案',async()=>{const f=setup();const pending=vm.runInContext("action('backend',{})",f.context);vm.runInContext("app().backend='https://other.example'",f.context);f.check();await pending;assert.equal(f.saved(),undefined);assert.equal(f.elements.get('#backendResult').innerHTML,'');assert.equal(f.elements.get('[data-action="backend"]').disabled,false);});
