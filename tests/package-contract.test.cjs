'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {themeFields,compatibility,validateBase}=require('../core/package-contract.cjs');
const caps=require('../native/android/theme-capabilities.json');
const base={format:'hetun-base-apk',version:1,contract:'hetun-package-v1',runtime:'hetun-runtime-v1',theme:'hetun-skeleton-v2',assetRoot:'assets/',os:'android',packageName:'com.hetun.client',devices:['mobile'],...caps};
const manifest=theme=>({format:'hetun-skeleton',version:2,renderer:'hetun-v2',platform:'mobile',theme});
test('页面设计必须是受限字典，数组不能绕过模块校验',()=>{
 for(const pageDesign of [[],null,'invalid',{home:{modules:[]}}, {home:{modules:null}}, {player:{modules:{content:{title:'invalid'}}}}])assert.throws(()=>themeFields({pageDesign}),/页面/);
 const theme={schemaVersion:2,pageDesign:{home:{modules:{content:{style:'grid3',title:'首页模块'}}}},sections:[{id:'s',kind:'landscape',background:'#123456',textColor:'#ffffff'}]};
 assert.equal(compatibility(base,manifest(theme),'mobile').ready,true);
});
test('枚举字段拒绝数组冒充文字，包括旧底包未声明枚举时',()=>{
 for(const theme of [{navigation:[{page:['home']}]},{sections:[{style:['grid3']}]},{pageDesign:{home:{modules:{content:{style:['grid3']}}}}}])assert.throws(()=>compatibility({...base,themeValues:{}},manifest(theme),'mobile'),/枚举必须为文字/);
 const result=compatibility(base,manifest({navigation:[{page:'unknown'}]}),'mobile');assert.equal(result.ready,false);
 assert.throws(()=>validateBase({...base,themeValues:{'navigation[].page':[['home']]}}),/取值声明/);
 assert.throws(()=>validateBase({...base,themeValues:{schemaVersion:[2.5]}}),/取值声明/);
 assert.equal(validateBase({...base,themeValues:{schemaVersion:[2]}}).themeValues.schemaVersion[0],2);
});
