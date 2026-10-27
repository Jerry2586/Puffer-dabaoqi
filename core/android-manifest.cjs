'use strict';
// Edits literal manifest values without rebuilding dex or resources. String indices are preserved.
function parse(input){const b=Buffer.from(input);if(b.length<8||b.readUInt16LE(0)!==3||b.readUInt32LE(4)!==b.length)throw Error('AndroidManifest.xml 不是有效二进制 XML');if(b.readUInt16LE(2)!==8)throw Error('XML 头长度无效');let chunks=[],pool,strings=[];for(let p=b.readUInt16LE(2);p<b.length;){if(p+8>b.length)throw Error('XML 块损坏');const type=b.readUInt16LE(p),h=b.readUInt16LE(p+2),n=b.readUInt32LE(p+4);if(n<h||h<8||p+n>b.length)throw Error('XML 块越界');const c=Buffer.from(b.subarray(p,p+n));if(type===1){if(pool||h<28)throw Error('XML 字符串池无效');pool=c;const count=c.readUInt32LE(8),start=c.readUInt32LE(20),utf8=!!(c.readUInt32LE(16)&256);if(count>100000||h+count*4>n)throw Error('XML 字符串数量无效');function len(at,wide){let v=wide?c.readUInt16LE(at):c[at];if(v===undefined)throw Error('字符串越界');if(v&(wide?32768:128)){const next=wide?c.readUInt16LE(at+2):c[at+1];return [((v&(wide?32767:127))*(wide?65536:256))+next,wide?4:2];}return [v,wide?2:1];}for(let i=0;i<count;i++){let at=start+c.readUInt32LE(h+i*4);const a=len(at,!utf8);at+=a[1];let size=a[0];if(utf8){const x=len(at,false);size=x[0];at+=x[1];}const end=at+size*(utf8?1:2);if(end>n)throw Error('字符串越界');strings.push(c.subarray(at,end).toString(utf8?'utf8':'utf16le'));}}chunks.push({type,data:c});p+=n;}if(!pool)throw Error('缺少 XML 字符串池');return {b,chunks,pool,strings};}
function attributes(doc,visit){for(const {type,data:c}of doc.chunks){if(type!==0x102)continue;const h=c.readUInt16LE(2);if(h+20>c.length)throw Error('XML 元素损坏');const element=doc.strings[c.readUInt32LE(h+4)],start=h+c.readUInt16LE(h+8),size=c.readUInt16LE(h+10),count=c.readUInt16LE(h+12);if(size<20||start+size*count>c.length)throw Error('XML 属性损坏');for(let i=0;i<count;i++){const p=start+i*size,ns=c.readUInt32LE(p),name=doc.strings[c.readUInt32LE(p+4)],raw=c.readUInt32LE(p+8),t=c[p+15],data=c.readUInt32LE(p+16);visit({element,name,namespace:doc.strings[ns],type:t,value:t===3?doc.strings[data]:data,raw:doc.strings[raw],chunk:c,offset:p});}}}
function inspectManifest(b){const doc=parse(b),out={};attributes(doc,a=>{if(a.element==='manifest'&&a.name==='package'&&!a.namespace)out.packageName=a.value;if(a.element==='manifest'&&a.namespace==='http://schemas.android.com/apk/res/android'&&a.name==='versionName')out.versionName=a.value;if(a.element==='manifest'&&a.namespace==='http://schemas.android.com/apk/res/android'&&a.name==='versionCode')out.versionCode=a.value;});if(typeof out.packageName!=='string'||typeof out.versionName!=='string'||!Number.isInteger(out.versionCode))throw Error('APK 必须使用固定字面量包名和版本');return out;}
function rewriteLink(doc,values,index){
 const link=require('./advanced-config.cjs').advancedConfig(values);
 const android='http://schemas.android.com/apk/res/android';
 const placeholders={scheme:'hetun-scheme-placeholder',host:'hetun-host-placeholder.invalid'};
 const attrsByChunk=new Map();
 attributes(doc,a=>{
  const list=attrsByChunk.get(a.chunk)||[];
  list.push(a);
  attrsByChunk.set(a.chunk,list);
 });
 const literal=(a,name,value)=>a.namespace===android&&a.name===name&&a.type===3&&(value===undefined||a.value===value);
 const pairs=[];
 for(const list of attrsByChunk.values()){
  if(list[0].element!=='data'||!list.some(a=>Object.entries(placeholders).some(([name,value])=>literal(a,name,value))))continue;
  const scheme=list.filter(a=>literal(a,'scheme',placeholders.scheme));
  const host=list.filter(a=>literal(a,'host',placeholders.host));
  if(list.length!==2||scheme.length!==1||host.length!==1)throw Error('网页唤起占位 data 必须只包含唯一的 scheme 与 host');
  pairs.push({scheme:scheme[0],host:host[0]});
 }
 if(!pairs.length&&!link.scheme)return;
 if(pairs.length!==1)throw Error('基础 APK 缺少唯一的网页唤起占位入口，请重新制作基础包。');
 const pair=pairs[0],stack=[];
 let start=-1,end=-1;
 function element(c){
  const h=c.data.readUInt16LE(2);
  if(h<16||h+8>c.data.length)throw Error('网页唤起占位入口 XML 元素无效');
  const nameIndex=c.data.readUInt32LE(h+4),name=doc.strings[nameIndex];
  if(nameIndex===0xffffffff||!name)throw Error('XML 元素名称无效');
  return name;
 }
 for(let i=0;i<doc.chunks.length;i++){
  const c=doc.chunks[i];
  if(c.type!==0x102&&c.type!==0x103)continue;
  const name=element(c);
  if(c.type===0x102){
   if(c.data===pair.scheme.chunk){
    if(stack.map(p=>p.name).join('/')!=='manifest/application/activity/intent-filter')throw Error('网页唤起占位入口必须位于 activity 的独立 intent-filter');
    start=stack.at(-1).i;
   }
   stack.push({name,i});
  }else{
   const opened=stack.pop();
   if(!opened||opened.name!==name)throw Error('XML 元素不匹配');
   if(opened.i===start){end=i;break;}
  }
 }
 if(start<0||end<0)throw Error('网页唤起占位入口结构无效');
 const counts={};
 const actions=[],categories=[],depth=[];
 for(const c of doc.chunks.slice(start,end+1)){
  if(c.type!==0x102&&c.type!==0x103)continue;
  const name=element(c);
  if(c.type===0x103){
   if(depth.pop()!==name)throw Error('XML 元素不匹配');
   continue;
  }
  if(depth.length&&depth.at(-1)!=='intent-filter')throw Error('网页唤起占位入口不能包含嵌套元素');
  if((name==='intent-filter')!==(depth.length===0))throw Error('网页唤起占位入口结构无效');
  depth.push(name);
  counts[name]=(counts[name]||0)+1;
  const attrs=attrsByChunk.get(c.data)||[];
  if(name==='intent-filter'){
   if(attrs.length)throw Error('网页唤起占位 intent-filter 不得包含额外属性');
  }else if(name==='action'||name==='category'){
   if(attrs.length!==1||!literal(attrs[0],'name'))throw Error('网页唤起占位入口属性无效');
   (name==='action'?actions:categories).push(attrs[0].value);
  }else if(name!=='data'||c.data!==pair.scheme.chunk){
   throw Error('网页唤起占位入口必须使用独立 VIEW 模板');
  }
 }
 if(depth.length||Object.keys(counts).length!==4||counts['intent-filter']!==1||counts.action!==1||counts.category!==2||counts.data!==1||actions[0]!=='android.intent.action.VIEW'||new Set(categories).size!==2||!categories.includes('android.intent.category.DEFAULT')||!categories.includes('android.intent.category.BROWSABLE'))throw Error('网页唤起占位入口必须使用独立 VIEW 模板');
 if(!link.scheme){
  doc.chunks.splice(start,end-start+1);
  return;
 }
 for(const key of ['scheme','host']){
  const a=pair[key],n=index(link[key]);
  a.chunk.writeUInt32LE(n,a.offset+8);
  a.chunk.writeUInt32LE(n,a.offset+16);
 }
}
function rewriteManifest(b,values){if(!values||typeof values.name!=='string'||!values.name.trim()||values.name.length>80||typeof values.versionName!=='string'||values.versionName.length>150||!Number.isInteger(values.versionCode)||values.versionCode<1||values.versionCode>2100000000)throw Error('APK 名称或版本无效');const doc=parse(b);let found=new Set();function index(s){let n=doc.strings.indexOf(s);if(n<0){n=doc.strings.length;doc.strings.push(s);}return n;}rewriteLink(doc,values,index);attributes(doc,a=>{const key=a.element==='manifest'&&a.namespace==='http://schemas.android.com/apk/res/android'&&['versionName','versionCode'].includes(a.name)?a.name:a.element==='application'&&a.name==='label'&&a.namespace==='http://schemas.android.com/apk/res/android'?'name':null;if(!key||values[key]===undefined)return;if(key!=='versionCode'&&a.type!==3)throw Error('基础 APK 的名称与版本必须是字面量，不能引用资源');found.add(key);const n=key==='versionCode'?Number(values[key]):index(String(values[key]));a.chunk.writeUInt32LE(key==='versionCode'?0xffffffff:n,a.offset+8);a.chunk[a.offset+15]=key==='versionCode'?16:3;a.chunk.writeUInt32LE(n,a.offset+16);});for(const k of ['name','versionName','versionCode'])if(!found.has(k))throw Error('基础 APK 缺少可修改字段：'+k);const old=doc.pool,h=old.readUInt16LE(2);if(old.readUInt32LE(12)!==0)throw Error('不支持带样式的 manifest 字符串池');const offsets=[],parts=[];let pos=0;for(const s of doc.strings){const data=Buffer.from(s,'utf16le');if(s.length>32767)throw Error('XML 字符串过长');const entry=Buffer.alloc(2+data.length+2);entry.writeUInt16LE(s.length);data.copy(entry,2);offsets.push(pos);parts.push(entry);pos+=entry.length;}const start=h+offsets.length*4,padded=(pos+3)&~3,out=Buffer.alloc(start+padded);old.copy(out,0,0,h);out.writeUInt32LE(out.length,4);out.writeUInt32LE(offsets.length,8);out.writeUInt32LE(old.readUInt32LE(16)&~257,16);out.writeUInt32LE(start,20);out.writeUInt32LE(0,24);offsets.forEach((v,i)=>out.writeUInt32LE(v,h+i*4));Buffer.concat(parts).copy(out,start);const chunks=doc.chunks.map(c=>c.type===1?out:c.data),header=Buffer.from(doc.b.subarray(0,doc.b.readUInt16LE(2))),result=Buffer.concat([header,...chunks]);result.writeUInt32LE(result.length,4);return result;}
module.exports={inspectManifest,rewriteManifest};
