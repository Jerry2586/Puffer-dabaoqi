'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {run}=require('./process.cjs');const {text}=require('./domain.cjs');
async function addSignature(store,vault,input,source=''){
 const name=text(input.name,60),alias=text(input.alias,80),password=String(input.password||''),keyPassword=String(input.keyPassword||password);
 if(!['generate','import'].includes(input.mode)||Boolean(source)!==(input.mode==='import'))throw Error('签名操作方式无效。');
 if(!name||!/^[a-zA-Z0-9._-]{1,80}$/.test(alias)||password.length<6||keyPassword.length<6)throw Error('请填写签名名称、有效别名及至少6位密码。');
 if(input.mode==='generate'&&String(input.confirmPassword||'')!==password)throw Error('两次密钥库密码不一致。');
 const id=crypto.randomUUID(),file=path.join(store.root,'signatures',id+'.jks'),keytool=path.join(store.state.settings.tools.javaHome,'bin',process.platform==='win32'?'keytool.exe':'keytool');
 const env={HETUN_STORE_PASS:password,HETUN_KEY_PASS:keyPassword},options={env,secrets:[password,keyPassword],timeout:30000};let secretRef='',item;
 try{
  await fs.mkdir(path.dirname(file),{recursive:true});
  if(source)await fs.copyFile(source,file);else await run(keytool,['-genkeypair','-keystore',file,'-storetype','JKS','-alias',alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Hetun Application, OU=Applications, O=Hetun, C=CN','-storepass:env','HETUN_STORE_PASS','-keypass:env','HETUN_KEY_PASS','-noprompt'],options);
  const output=await run(keytool,['-list','-v','-keystore',file,'-alias',alias,'-storepass:env','HETUN_STORE_PASS','-J-Duser.language=en','-J-Duser.country=US'],options);
  if(!output.includes('PrivateKeyEntry'))throw Error('该别名不是可签名的私钥。');
  const fingerprint=output.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1];if(!fingerprint)throw Error('无法读取签名指纹。');
  // A listing checks the store password only. A CSR also proves the private key can be read.
  if(source)await run(keytool,['-certreq','-keystore',file,'-alias',alias,'-storepass:env','HETUN_STORE_PASS','-keypass:env','HETUN_KEY_PASS'],options);
  secretRef=crypto.randomUUID();await vault.put(JSON.stringify({password,keyPassword}),secretRef);
  item={id,name,alias,file,secretRef,fingerprint,createdAt:new Date().toISOString()};store.state.signatures.push(item);
  await store.commit();return {...item,secretRef:undefined};
 }catch(error){
  if(item){const index=store.state.signatures.indexOf(item);if(index>=0)store.state.signatures.splice(index,1);}
  const cleanup=await Promise.allSettled([fs.rm(file,{force:true}),secretRef?vault.remove(secretRef):Promise.resolve()]);
  if(cleanup.some(result=>result.status==='rejected'))throw Error(error.message+'；签名临时文件清理失败，请检查本机存储。');
  throw error;
 }
}
module.exports={addSignature};
