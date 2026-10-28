'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
test('原生本地资源使用固定 HTTPS origin，避免 /client/ 路由改写 Logo、封面和视频路径',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../native/client/src/services/api.ts'),'utf8');
 const fn=source.slice(source.indexOf('export function assetUrl(')).trim().replace('export function assetUrl(value:string)','function assetUrl(value)');
 const assetUrl=vm.runInNewContext(fn+';assetUrl');const hash='a'.repeat(64);
 for(const ext of ['png','jpg','webp','svg','mp4']){const result=assetUrl('assets/'+hash+'.'+ext);assert.equal(result,'https://appassets.androidplatform.net/assets/'+hash+'.'+ext);assert.equal(new URL(result,'https://appassets.androidplatform.net/client/').pathname,'/assets/'+hash+'.'+ext);}
 assert.equal(assetUrl('https://cdn.example.test/image.png'),'https://cdn.example.test/image.png');
 for(const value of ['', '../assets/'+hash+'.png','assets/../runtime.json','assets/'+hash+'.png?x=1','http://cdn.example.test/a.png','file:///a.png','javascript:alert(1)'])assert.equal(assetUrl(value),'');
});
