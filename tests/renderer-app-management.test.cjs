'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const calls=[],listeners={},menus=[],elements=new Map([['#content',{}],['#overlay',{}],['#toast',{classList:{add(){},remove(){}}}],['#overlay [data-action="close"]',{focus(){calls.push(['cancelFocus']);}}]]);
 const makeApp=(id,name)=>({id,name,createdAt:'2026-10-27',backend:'',profiles:Object.fromEntries(['mobile','tablet','tv','desktop'].map(d=>[d,{}]))});
 const initial={apps:[makeApp('selected','当前应用'),makeApp('target','目标 <应用>')],selectedApp:'selected',history:[]};
 const api={state:()=>new Promise(()=>{}),onEvent(){},remove:async data=>{calls.push(['remove',data.id]);return initial;},duplicate:async data=>{calls.push(['duplicate',data.id]);return initial;},export:async data=>{calls.push(['export',data.id]);return null;}};
 const context=vm.createContext({window:{packer:api},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>s==='.app-management[open]'?menus.filter(m=>m.open):[],addEventListener:(event,fn)=>{listeners[event]=fn;}},initial,structuredClone,setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),context);vm.runInContext('state=structuredClone(initial);route="apps";shell=()=>{};',context);
 return {calls,elements,listeners,menus,run:s=>vm.runInContext(s,context)};
}
test('卡片删除显示被操作档案名称，取消不删除，确认仅删除目标档案',async()=>{
 const f=setup();await f.run('action("delete",{dataset:{id:"target"}})');
 const html=f.elements.get('#overlay').innerHTML;assert.match(html,/目标 &lt;应用&gt;/);assert.match(html,/保留源代码、签名和构建产物/);assert.match(html,/data-action="deleteConfirm" data-id="target"/);assert.equal(f.calls.filter(c=>c[0]==='remove').length,0);assert.deepEqual(f.calls,[['cancelFocus']]);
 await f.run('action("close",{dataset:{}})');assert.equal(f.elements.get('#overlay').innerHTML,'');assert.equal(f.calls.filter(c=>c[0]==='remove').length,0);
 await f.run('action("delete",{dataset:{id:"target"}})');await f.run('action("deleteConfirm",{dataset:{id:"target"}})');assert.deepEqual(f.calls.filter(c=>c[0]==='remove'),[['remove','target']]);
});
test('卡片复制与导出使用操作卡片 ID，导出取消不修改当前档案',async()=>{
 const f=setup();await f.run('action("duplicate",{dataset:{id:"target"}})');await f.run('action("export",{dataset:{id:"target"}})');assert.deepEqual(f.calls,[['duplicate','target'],['export','target']]);assert.equal(f.run('state.selectedApp'),'selected');
});
test('管理菜单点击外部或 Escape 关闭，Escape 将焦点还给原卡片入口',async()=>{
 const f=setup();let focused=0;const first={open:true,querySelector:()=>({focus(){focused++;}})},second={open:true,querySelector:()=>({focus(){focused++;}})};f.menus.push(first,second);
 f.listeners.click({target:{closest:s=>s==='.app-management'?second:null}});assert.equal(first.open,false);assert.equal(second.open,true);
 f.listeners.keydown({key:'Escape',target:{}});assert.equal(second.open,false);assert.equal(focused,1);
 first.open=true;await f.listeners.click({target:{closest:()=>null}});assert.equal(first.open,false);
});
