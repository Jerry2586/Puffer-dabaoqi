'use strict';
const CONTRACT='hetun-package-v1';
const DESIGN_PAGES=new Set('home category search shortdrama member mine ranking schedule library history settings disclaimer privacy about player together detail login downloads feedback orders recharge dialog empty'.split(' '));
function visitTheme(theme,visit){
 function walk(v,p,page){
  if(v===undefined)return;
  if(/^(skeleton\.kind|pageStyles\.(design|header|member|mine|navigation)|(?:navigation|categories|sections|ads)\[\]\.page|carousel\.slides\[\]\.page|announcement\.page|sections\[\]\.(kind|source|style|orderBy)|pageDesign\[\]\.modules\[\]\.style)$/.test(p)&&typeof v!=='string')throw Error('主题枚举必须为文字：'+p);
  if((p==='pageDesign'||p==='pageDesign[].modules')&&(!v||typeof v!=='object'||Array.isArray(v)))throw Error('页面设计和模块设置必须为对象：'+p);
  if(Array.isArray(v)){visit(p,v);for(const x of v)walk(x,p+'[]',page);return;}
  if(v&&typeof v==='object'){
   const entries=Object.entries(v);if(!entries.length&&p)visit(p,v);
   for(const [k,x]of entries){
    if(p==='pageDesign'){
     if(!(DESIGN_PAGES.has(k)||/^category(?:[0-9a-f]{2}){1,64}$/.test(k))||!x||typeof x!=='object'||Array.isArray(x))throw Error('页面设计编号或内容无效：'+k);
     walk(x,p+'[]',k);
    }else if(p==='pageDesign[].modules'){
     if(!(page==='home'?['highlights','recommendations','content']:page==='category'||/^category(?:[0-9a-f]{2}){1,64}$/.test(page||'')?['content']:[]).includes(k)||!x||typeof x!=='object'||Array.isArray(x))throw Error('页面模块设置无效：'+k);
     walk(x,p+'[]',page);
    }else{
     if(!/^[A-Za-z][A-Za-z0-9]*$/.test(k))throw Error('主题字段名称无效：'+p+'.'+k);
     walk(x,p?p+'.'+k:k,page);
    }
   }
  }else visit(p,v);
 }
 walk(theme,'','');
}
function themeFields(theme){const fields=[];visitTheme(theme,p=>fields.push(p));return [...new Set(fields)].sort();}
function requirements(manifest){if(manifest?.format!=='hetun-skeleton'||manifest.version!==2||manifest.renderer!=='hetun-v2'||!manifest.theme)throw Error('仅支持河豚主题协议 v2');return {contract:CONTRACT,theme:'hetun-skeleton-v2',fields:themeFields(manifest.theme)};}
function validateBase(d){if(!d||d.format!=='hetun-base-apk'||d.version!==1||d.contract!==CONTRACT||d.runtime!=='hetun-runtime-v1'||d.theme!=='hetun-skeleton-v2'||d.assetRoot!=='assets/'||d.os!=='android')throw Error('APK 未接入河豚二次打包协议 v1');if(!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(d.packageName||''))throw Error('基础包包名无效');if(!Array.isArray(d.devices)||!d.devices.length||d.devices.some(x=>!['mobile','tablet','tv'].includes(x)))throw Error('基础包设备声明无效');if(typeof d.renderer!=='string'||!d.renderer||!Array.isArray(d.themeFields)||!d.themeFields.length||d.themeFields.length>512||d.themeFields.some(x=>typeof x!=='string'||!/^([A-Za-z][A-Za-z0-9]*(\[\])?)(\.[A-Za-z][A-Za-z0-9]*(\[\])?)*$/.test(x)))throw Error('基础包必须声明实际实现的主题字段');if(d.themeValues!==undefined){if(!d.themeValues||typeof d.themeValues!=='object'||Array.isArray(d.themeValues))throw Error('基础包主题取值声明无效');for(const [field,values]of Object.entries(d.themeValues))if(!d.themeFields.includes(field)||!Array.isArray(values)||!values.length||values.length>100||values.some(v=>field==='schemaVersion'?!Number.isSafeInteger(v):typeof v!=='string'))throw Error('基础包主题取值声明无效：'+field);}return d;}
function compatibility(descriptor,manifest,device){const d=validateBase(descriptor),r=requirements(manifest),platform=manifest.platform==='web'?'desktop':manifest.platform;const errors=[];if(!d.devices.includes(device)||platform!==device)errors.push('基础包、主题和当前设备不一致');visitTheme(manifest.theme,(p,value)=>{if(d.themeValues?.[p]&&!d.themeValues[p].includes(value))errors.push('原生渲染器不支持设置：'+p+'='+String(value));});const supported=new Set(d.themeFields),missing=r.fields.filter(x=>!supported.has(x));if(missing.length)errors.push('原生渲染器尚未实现主题字段：'+missing.join('、'));return {contract:CONTRACT,ready:!errors.length,errors,missing,requirements:r,renderer:d.renderer};}
module.exports={CONTRACT,themeFields,requirements,validateBase,compatibility};
