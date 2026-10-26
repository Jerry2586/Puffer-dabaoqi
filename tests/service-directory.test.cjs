'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifiedDirectory}=require('../core/service-directory.cjs'),{runtime}=require('../core/native-project.cjs'),{newApp,normalizeApp}=require('../core/domain.cjs');
function signed(addresses=['https://primary.example.test','https://backup.example.test'],pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048})){
 const der=pair.publicKey.export({format:'der',type:'spki'}),bytes=Buffer.from(JSON.stringify({contract:'hetun-service-directory-v1',keyId:crypto.createHash('sha256').update(der).digest('hex'),revision:4,addresses,recoveryUrls:['https://independent.example.test/addresses.json']}));
 return {payload:bytes.toString('base64'),signature:crypto.sign('RSA-SHA256',bytes,pair.privateKey).toString('base64'),publicKey:der.toString('base64')};
}
test('服务地址验证签名、固定身份，拒绝篡改及不安全地址',()=>{
 const envelope=signed(),out=verifiedDirectory(envelope);assert.equal(out.revision,4);assert.equal(out.addresses.length,2);
 assert.throws(()=>verifiedDirectory({...envelope,payload:Buffer.from('{}').toString('base64')}),/签名/);
 assert.throws(()=>verifiedDirectory(envelope,signed().publicKey),/身份/);
 for(const address of ['http://plain.test','https://u:p@example.test','https://example.test/admin','https://example.test/?token=1'])assert.throws(()=>verifiedDirectory(signed([address])),/HTTPS/);
});
test('打包运行配置带主备地址；改后台后拒绝沿用旧目录或悄悄换身份',()=>{
 const app=newApp('routing');app.backend='https://primary.example.test';app.serviceDirectory=signed();app.profiles.mobile.android.packageName='com.hetun.routing';
 assert.deepEqual(runtime(app).serviceDirectory.addresses,['https://primary.example.test','https://backup.example.test']);
 assert.throws(()=>normalizeApp({...app,backend:'https://another.test'},app),/重新检测/);
 assert.throws(()=>normalizeApp({...app,serviceDirectory:signed()},app),/身份/);
 assert.equal(normalizeApp({...app,backend:'https://another.test',serviceDirectory:null},app).serviceDirectory,null);
});

test('配置后台后必须检测导入目录才能出包',async()=>{
 const {Engine}=require('../core/engine.cjs');const app=newApp('missing-directory');app.backend='https://primary.example.test';
 const store={state:{themes:[],bases:[],signatures:[],settings:{tools:{}}}};
 const result=await new Engine(store,{}).inspect(app);const check=result.checks.find(x=>x.name==='主备域名目录');assert.equal(check.ok,false);assert.equal(result.ready,false);
});

test('保存和生成时拒绝与后台不匹配的签名目录，后台必须为纯域名',()=>{
 const app=newApp('bound-directory');app.backend='https://primary.example.test';app.serviceDirectory=signed();app.profiles.mobile.android.packageName='com.hetun.bound';
 const unrelated={...app,backend:'https://unrelated.example.test',serviceDirectory:signed()};
 assert.throws(()=>normalizeApp(unrelated,app),/当前后台域名/);
 assert.throws(()=>runtime(unrelated),/当前后台域名/);
 assert.throws(()=>runtime({...app,backend:'https://primary.example.test/admin',serviceDirectory:null}),/纯域名/);
});
