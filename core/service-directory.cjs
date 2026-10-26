'use strict';
const crypto=require('node:crypto');
function verifiedDirectory(envelope,expectedKey='',expectedBase=''){
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>20000||typeof envelope.publicKey!=='string'||envelope.publicKey.length>4096||typeof envelope.signature!=='string'||envelope.signature.length>2048)throw Error('后台未提供有效的服务地址签名，请先更新运营端。');
 if(expectedKey&&envelope.publicKey!==expectedKey)throw Error('服务身份发生变化；请检查是否连接了其他后台。');
 const bytes=Buffer.from(envelope.payload,'base64'),der=Buffer.from(envelope.publicKey,'base64'),key=crypto.createPublicKey({key:der,format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048||!crypto.verify('RSA-SHA256',bytes,key,Buffer.from(envelope.signature,'base64')))throw Error('服务地址签名验证失败。');
 const payload=JSON.parse(bytes.toString('utf8'));
 if(payload.contract!=='hetun-service-directory-v1'||payload.keyId!==crypto.createHash('sha256').update(der).digest('hex')||!Number.isSafeInteger(payload.revision)||payload.revision<0||!Array.isArray(payload.addresses)||!payload.addresses.length||payload.addresses.length>5||!Array.isArray(payload.recoveryUrls)||payload.recoveryUrls.length>3)throw Error('服务地址协议不兼容。');
 for(const [values,file]of [[payload.addresses,false],[payload.recoveryUrls,true]])for(const value of values){if(typeof value!=='string')throw Error('服务地址必须为 HTTPS 字符串。');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!file&&u.pathname!=='/')throw Error('服务地址必须使用 HTTPS 纯域名。');}
 const addresses=payload.addresses.map(value=>new URL(value).origin);
 if(expectedBase&&!addresses.includes(new URL(expectedBase).origin))throw Error('签名目录不包含当前后台域名，请重新检测服务地址。');
 return {publicKey:envelope.publicKey,addresses,recoveryUrls:payload.recoveryUrls,revision:payload.revision};
}
module.exports={verifiedDirectory};
