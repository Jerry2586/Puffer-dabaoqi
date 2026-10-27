'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {addSignature}=require('../core/signatures.cjs');
test('真实 JKS 生成、私钥密码校验和失败回滚',{timeout:120000},async t=>{
 const executable=process.platform==='win32'?'keytool.exe':'keytool';let javaHome='';
 for(const bin of [process.env.JAVA_HOME&&path.join(process.env.JAVA_HOME,'bin'),...(process.env.PATH||'').split(path.delimiter)].filter(Boolean)){try{const file=await fs.realpath(path.join(bin,executable));javaHome=path.dirname(path.dirname(file));break;}catch{}}
 assert.ok(javaHome,'签名集成测试需要 JDK：请配置 JAVA_HOME 或将 keytool 加入 PATH。');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-signature-'));
 const store={root,state:{settings:{tools:{javaHome}},signatures:[]},commit:async()=>{}},secrets=new Map(),vault={async put(value,ref){secrets.set(ref,value);return ref;},async remove(ref){secrets.delete(ref);}};
 const input={mode:'generate',name:'测试签名',alias:'release',password:'temporary-store-only',confirmPassword:'temporary-store-only',keyPassword:'temporary-key-only'};let generated;
 try{
 await t.test('生成有效 RSA 私钥，公开元数据不含凭据',async()=>{generated=await addSignature(store,vault,input);assert.match(generated.fingerprint,/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);assert.equal(generated.secretRef,undefined);assert.equal(store.state.signatures.length,1);assert.equal(secrets.size,1);assert.ok((await fs.stat(generated.file)).size>1000);assert.doesNotMatch(JSON.stringify(generated),/temporary-store-only|temporary-key-only/);});
 await t.test('导入实际检查私钥密码，拒绝错误密码并保留源文件',async()=>{await assert.rejects(addSignature(store,vault,{...input,mode:'import',keyPassword:'wrong-password'},generated.file));assert.equal(store.state.signatures.length,1);assert.equal(secrets.size,1);assert.equal((await fs.readdir(path.join(root,'signatures'))).length,1);assert.ok(await fs.stat(generated.file));});
 await t.test('导入有效签名保留证书指纹',async()=>{const item=await addSignature(store,vault,{...input,mode:'import'},generated.file);assert.equal(item.fingerprint,generated.fingerprint);assert.notEqual(item.file,generated.file);assert.equal(store.state.signatures.length,2);});
 await t.test('提交失败回滚内存、私钥副本和加密凭据',async()=>{const before=await fs.readdir(path.join(root,'signatures'));store.commit=async()=>{throw Error('模拟持久化失败');};await assert.rejects(addSignature(store,vault,{...input,mode:'import'},generated.file),/模拟持久化失败/);assert.equal(store.state.signatures.length,2);assert.equal(secrets.size,2);assert.deepEqual(await fs.readdir(path.join(root,'signatures')),before);store.commit=async()=>{};});
 await t.test('凭据写入中断也清理已写入内容',async()=>{const broken={...vault,async put(value,ref){secrets.set(ref,value);throw Error('模拟凭据写入中断');}};await assert.rejects(addSignature(store,broken,{...input,mode:'import'},generated.file),/模拟凭据写入中断/);assert.equal(secrets.size,2);assert.equal(store.state.signatures.length,2);assert.equal((await fs.readdir(path.join(root,'signatures'))).length,2);});
 await t.test('模式及确认密码错误在文件创建前拒绝',async()=>{await assert.rejects(addSignature(store,vault,{...input,confirmPassword:'mismatch'}),/两次/);await assert.rejects(addSignature(store,vault,{...input,mode:'import'}),/方式/);assert.equal((await fs.readdir(path.join(root,'signatures'))).length,2);});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
