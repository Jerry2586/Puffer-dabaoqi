'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const elements=new Map([['.shell',{}],['#overlay',{innerHTML:''}],['#content',{innerHTML:''}],['#appSignature',{focus(){}}],['#toast',{classList:{add(){},remove(){}}}]]);
 const values={alias:'release',password:'test-only-password',confirmPassword:'test-only-password',keyPassword:''},fields=Object.entries(values).map(([key,value])=>({dataset:{signature:key},value}));
 const initial={selectedApp:'app',signatures:[{id:'old-sign',name:'已有签名',alias:'old'}],bases:[],history:[],apps:[{id:'app',name:'应用',backend:'https://example.test',selectedDevice:'mobile',selectedOS:'android',profiles:{mobile:{android:{packageName:'com.example.unique',versionName:'8.2.1',versionCode:8,signatureId:'old-sign'},uploadedTheme:null},tablet:{android:{signatureId:'tablet-sign'}}}}]};
 const calls=[],api={state:()=>new Promise(()=>{}),onEvent(){},save:async value=>{calls.push(structuredClone(value));const next=JSON.parse(vm.runInContext('JSON.stringify(state)',context));next.apps[0]=structuredClone(value);return next;}};
 const context=vm.createContext({window:{packer:api},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>s==='#signatureForm [data-signature]'?fields:[],addEventListener(){}},initial,setTimeout:()=>0,clearTimeout(){},structuredClone});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),context);vm.runInContext('state=structuredClone(initial);shell=()=>{lockBaseImport();};renderActivity=()=>{}',context);
 return {context,api,elements,fields,calls,state:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)),run:s=>vm.runInContext(s,context)};
}
test('生成签名先保存未保存编辑，再自动绑定当前设备，密码不进入应用档案',async()=>{
 const f=setup();f.run("app().name='未保存名称';dirty=true");let complete,received;f.api.signature=data=>{received=structuredClone(data);return new Promise(resolve=>complete=resolve);};
 const pending=f.run('saveAppSignature()');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls[0].name,'未保存名称');assert.equal(f.elements.get('.shell').inert,true);await f.run('saveAppSignature()');assert.equal(f.calls.length,1);
 const result=f.state();result.signatures.push({id:'new-sign',name:'本机签名',alias:'release'});complete(result);await pending;
 assert.equal(received.mode,'generate');assert.equal(received.password,'test-only-password');assert.equal(f.calls.length,2);assert.equal(f.state().apps[0].profiles.mobile.android.signatureId,'new-sign');assert.equal(f.state().apps[0].profiles.tablet.android.signatureId,'tablet-sign');assert.equal(f.state().apps[0].name,'未保存名称');assert.doesNotMatch(JSON.stringify(f.calls),/test-only-password|keyPassword/);assert.equal(f.run('dirty'),false);assert.equal(f.elements.get('.shell').inert,false);
});
test('取消导入签名保留当前绑定和表单，错误时解锁并可重试',async()=>{
 const f=setup();let mode;f.api.signature=async data=>{mode=data.mode;return null;};const before=f.state();await f.run("saveAppSignature('import')");assert.equal(mode,'import');assert.deepEqual(f.state(),before);assert.equal(f.calls.length,0);
 f.api.signature=async()=>{throw Error('密码错误');};await assert.rejects(f.run('saveAppSignature()'),/密码错误/);assert.deepEqual(f.state(),before);assert.equal(f.fields.find(v=>v.dataset.signature==='password').value,'test-only-password');assert.equal(f.elements.get('.shell').inert,false);
});
test('签名创建成功但绑定保存失败时保留签名与待保存配置，可用保存配置重试',async()=>{
 const f=setup();f.api.signature=async()=>{const next=f.state();next.signatures.push({id:'new-sign'});return next;};const save=f.api.save;f.api.save=async()=>{throw Error('磁盘写入失败');};await assert.rejects(f.run('saveAppSignature()'),/签名已保存，应用配置尚未保存/);assert.equal(f.state().signatures.at(-1).id,'new-sign');assert.equal(f.state().apps[0].profiles.mobile.android.signatureId,'new-sign');assert.equal(f.run('dirty'),true);assert.equal(f.elements.get('.shell').inert,false);f.api.save=save;await f.run('save()');assert.equal(f.run('dirty'),false);
});
test('包名版本仅在第三模块显示一次，完整签名表单直接展开，工具设置不再重复提供签名',()=>{
 const f=setup();f.run('renderWorkbench()');const html=f.elements.get('#content').innerHTML,part=html.slice(html.indexOf('<span class="num">03</span>'),html.indexOf('<span class="num">04</span>'));
 assert.equal(html.split('com.example.unique').length-1,1);assert.equal(html.split('8.2.1').length-1,1);for(const label of ['应用名称','应用包名','版本名称','构建号','运营服务接入口','签名配置','生成新的 JKS','导入已有签名','密钥库密码','原私钥密码','网页唤起','渠道标识','统计服务'])assert.ok(part.includes(label),label);
 assert.doesNotMatch(html,/<details|settingsSignatures|管理签名|id="signatureMode"|data-action="advanced"/);f.run("state.settings={tools:{javaHome:'',androidHome:''}};settings('signatures')");const overlay=f.elements.get('#overlay').innerHTML;assert.doesNotMatch(overlay,/signatureMode|signatureAdd|data-tab="signatures"/);
});

test('密码确认不一致时不调用签名接口，不保存档案',async()=>{
 const f=setup();let calls=0;f.api.signature=async()=>{calls++;};f.fields.find(el=>el.dataset.signature==='confirmPassword').value='different';f.run('dirty=true');await assert.rejects(f.run('saveAppSignature()'),/两次密钥库密码不一致/);assert.equal(calls,0);assert.equal(f.calls.length,0);assert.equal(f.run('signatureBusy'),false);
});
test('导入无需确认密码；生成使用相同私钥密码，表单不进入持久配置',async()=>{
 const f=setup();f.fields.find(el=>el.dataset.signature==='confirmPassword').value='';let data;f.api.signature=async input=>{data=structuredClone(input);return null;};await f.run("saveAppSignature('import')");assert.equal(data.mode,'import');f.fields.find(el=>el.dataset.signature==='confirmPassword').value='test-only-password';f.fields.find(el=>el.dataset.signature==='keyPassword').value='ignored-import-password';await f.run('saveAppSignature()');assert.equal(data.keyPassword,data.password);
});
test('签名显示指纹与备份动作，唤起可编辑且未实现统计不提供假输入',()=>{
 const f=setup();f.run("state.signatures[0].file='C:/signatures/release.jks';state.signatures[0].fingerprint='AA:BB';renderWorkbench()");const html=f.elements.get('#content').innerHTML;assert.match(html,/备份 JKS/);assert.match(html,/打开签名目录/);assert.match(html,/AA:BB/);assert.match(html,/data-path="advanced\.scheme"/);assert.match(html,/data-path="advanced\.host"/);assert.doesNotMatch(html,/data-path="advanced\.(statisticsKey|privacyUrl)"/);assert.match(html,/当前底包未接入网页唤起/);assert.match(html,/id="buildChecks"/);
});
