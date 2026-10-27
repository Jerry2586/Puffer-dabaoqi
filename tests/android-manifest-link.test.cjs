'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {rewriteManifest,inspectManifest}=require('../core/android-manifest.cjs');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/AndroidManifest-deeplink.axml'));
const values={name:'唤起验证🎬',versionName:'二点零-验证',versionCode:7};
// Independent fixture reader: assertions inspect active XML, not unused pool bytes.
function decode(input){
 const chunks=[];
 for(let p=8;p<input.length;p+=input.readUInt32LE(p+4))chunks.push(Buffer.from(input.subarray(p,p+input.readUInt32LE(p+4))));
 const pool=chunks.find(c=>c.readUInt16LE(0)===1),strings=[];
 function length(at,wide){const first=wide?pool.readUInt16LE(at):pool[at],flag=wide?0x8000:0x80,unit=wide?2:1;return first&flag?[(first&(flag-1))*(wide?65536:256)+(wide?pool.readUInt16LE(at+unit):pool[at+unit]),unit*2]:[first,unit];}
 for(let i=0;i<pool.readUInt32LE(8);i++){
  let p=pool.readUInt32LE(20)+pool.readUInt32LE(pool.readUInt16LE(2)+i*4);
  const utf8=!!(pool.readUInt32LE(16)&256),first=length(p,!utf8);p+=first[1];
  const size=utf8?length(p,false):first;if(utf8)p+=size[1];
  strings.push(pool.subarray(p,p+size[0]*(utf8?1:2)).toString(utf8?'utf8':'utf16le'));
 }
 const nodes=[];
 for(const chunk of chunks){
  if(chunk.readUInt16LE(0)!==0x102)continue;
  const h=chunk.readUInt16LE(2),attrs=[],step=chunk.readUInt16LE(h+10);
  for(let i=0;i<chunk.readUInt16LE(h+12);i++){
   const p=h+chunk.readUInt16LE(h+8)+i*step;
   attrs.push({name:strings[chunk.readUInt32LE(p+4)],value:chunk[p+15]===3?strings[chunk.readUInt32LE(p+16)]:chunk.readUInt32LE(p+16),p});
  }
  nodes.push({name:strings[chunk.readUInt32LE(h+4)],chunk,attrs});
 }
 return {chunks,strings,nodes};
}
function encode(doc){const b=Buffer.concat([fixture.subarray(0,8),...doc.chunks]);b.writeUInt32LE(b.length,4);return b;}
function addAttr(doc,node,attr){
 const c=node.chunk,h=c.readUInt16LE(2),p=h+c.readUInt16LE(h+8)+c.readUInt16LE(h+10)*c.readUInt16LE(h+12);
 const out=Buffer.concat([c.subarray(0,p),Buffer.from(attr),c.subarray(p)]);
 out.writeUInt32LE(out.length,4);out.writeUInt16LE(c.readUInt16LE(h+12)+1,h+12);
 doc.chunks[doc.chunks.indexOf(c)]=out;
}
function assertRejected(doc,pattern){for(const link of [{},{scheme:'hetuntest',host:'open'}])assert.throws(()=>rewriteManifest(encode(doc),{...values,...link}),pattern);}
test('namespaced XML element headers remain compatible with the rewrite path',()=>{
 const doc=decode(fixture);
 for(const node of doc.nodes)node.chunk.writeUInt32LE(0,node.chunk.readUInt16LE(2));
 assert.doesNotThrow(()=>rewriteManifest(encode(doc),{...values,scheme:'hetuntest',host:'open'}));
});
test('active links are rewritten; blank links preserve launcher and remove the complete VIEW filter',()=>{
 const original=decode(fixture),enabled=decode(rewriteManifest(fixture,{...values,scheme:'hetuntest',host:'open'})),disabled=decode(rewriteManifest(fixture,values));
 const names=doc=>doc.nodes.flatMap(n=>n.attrs.filter(a=>a.name==='name').map(a=>a.value));
 assert.ok(names(enabled).includes('android.intent.action.VIEW'));
 assert.deepEqual(enabled.nodes.find(n=>n.name==='data').attrs.map(a=>[a.name,a.value]).sort(),[['host','open'],['scheme','hetuntest']]);
 assert.equal(disabled.nodes.some(n=>n.name==='data'),false);
 assert.equal(names(disabled).includes('android.intent.action.VIEW'),false);
 for(const name of ['android.intent.action.MAIN','android.intent.category.LAUNCHER'])assert.ok(names(disabled).includes(name));
 assert.equal(disabled.nodes.filter(n=>n.name==='intent-filter').length,original.nodes.filter(n=>n.name==='intent-filter').length-1);
 const b=rewriteManifest(fixture,values);assert.deepEqual(inspectManifest(b),{packageName:'com.hetun.client',versionName:values.versionName,versionCode:7});
 assert.equal(decode(b).nodes.find(n=>n.name==='application').attrs.find(a=>a.name==='label').value,values.name);
});
test('duplicate scheme, extra data attribute and incomplete/split placeholders are rejected',()=>{
 for(const mode of ['duplicate','extra','missing','split']){
  const doc=decode(fixture),data=doc.nodes.find(n=>n.name==='data'),scheme=data.attrs.find(a=>a.name==='scheme'),host=data.attrs.find(a=>a.name==='host');
  if(mode==='duplicate')addAttr(doc,data,data.chunk.subarray(scheme.p,scheme.p+20));
  if(mode==='extra'){
   const attr=Buffer.from(data.chunk.subarray(scheme.p,scheme.p+20));attr.writeUInt32LE(doc.strings.indexOf('name'),4);addAttr(doc,data,attr);
  }
  if(mode==='missing')data.chunk.writeUInt32LE(doc.strings.indexOf('name'),host.p+4);
  if(mode==='split'){
   const replacement=Buffer.from(data.chunk);replacement.writeUInt32LE(doc.strings.indexOf('name'),scheme.p+4);
   data.chunk.writeUInt32LE(doc.strings.indexOf('name'),host.p+4);
   doc.chunks.splice(doc.chunks.indexOf(data.chunk)+1,0,replacement);
  }
  assertRejected(doc,/占位 data/);
 }
});
test('a second placeholder, extra filter attributes and wrong parents are rejected',()=>{
 const duplicate=decode(fixture),data=duplicate.nodes.find(n=>n.name==='data');duplicate.chunks.splice(duplicate.chunks.indexOf(data.chunk),0,Buffer.from(data.chunk));assertRejected(duplicate,/唯一/);
 const extra=decode(fixture),filter=extra.nodes.filter(n=>n.name==='intent-filter').at(-1),action=extra.nodes.find(n=>n.attrs.some(a=>a.value==='android.intent.action.VIEW'));addAttr(extra,filter,action.chunk.subarray(action.attrs[0].p,action.attrs[0].p+20));assertRejected(extra,/额外属性/);
 const parent=decode(fixture),activity=parent.nodes.find(n=>n.name==='activity');activity.chunk.writeUInt32LE(parent.strings.indexOf('application'),activity.chunk.readUInt16LE(2)+4);assertRejected(parent,/activity/);
});
test('non VIEW action and duplicate categories cannot be removed as a dedicated link template',()=>{
 const actionDoc=decode(fixture),action=actionDoc.nodes.find(n=>n.attrs.some(a=>a.value==='android.intent.action.VIEW'));
 action.chunk.writeUInt32LE(actionDoc.strings.indexOf('android.intent.action.MAIN'),action.attrs[0].p+16);assertRejected(actionDoc,/VIEW 模板/);
 const categories=decode(fixture),category=categories.nodes.find(n=>n.attrs.some(a=>a.value==='android.intent.category.BROWSABLE'));
 category.chunk.writeUInt32LE(categories.strings.indexOf('android.intent.category.DEFAULT'),category.attrs[0].p+16);assertRejected(categories,/VIEW 模板/);
});
