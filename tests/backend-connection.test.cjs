const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {backendCheck,connectionBase}=require('../core/services.cjs');
function signed(base){const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const der=pair.publicKey.export({type:'spki',format:'der'});const payload=Buffer.from(JSON.stringify({contract:'hetun-service-directory-v1',keyId:crypto.createHash('sha256').update(der).digest('hex'),revision:1,addresses:[base],recoveryUrls:[]}));return {publicKey:der.toString('base64'),payload:payload.toString('base64'),signature:crypto.sign('RSA-SHA256',payload,pair.privateKey).toString('base64')};}
test('接入链接归一化并拒绝后台路径、明文远程地址',()=>{assert.equal(connectionBase('https://ops.example/api/service-directory'),'https://ops.example');for(const s of ['https://ops.example/abcdef','http://ops.example','https://u:p@ops.example','https://ops.example/?key=1'])assert.throws(()=>connectionBase(s));});
test('协议检测保留签名目录，内容失败不会伪报全部可用',async()=>{
 const base='https://ops.example',directory=signed(base),original=global.fetch;let contentOK=true,tamper=false;const paths=[];
 // Transport fixture tests schema/signature handling; real socket failures are covered in desktop.test.cjs.
 global.fetch=async url=>{const u=new URL(url);paths.push(u.pathname);let body;
 if(u.pathname==='/api/health')body={status:'ok',service:'hetun',product:'operations-center',contract:'hetun-operations-v1',cmsConfigured:contentOK};
 else if(u.pathname==='/api/service-directory')body=tamper?{...directory,payload:Buffer.from('{}').toString('base64')}:directory;
 else if(u.pathname==='/api/client/bootstrap')body={contract:'hetun-operations-v1',themeContract:'hetun-runtime-v1',platform:u.searchParams.get('platform'),os:u.searchParams.get('os'),config:{}};
 else body=contentOK?{items:[]}:{error:'尚未配置内容源'};
 return new Response(JSON.stringify(body),{status:!contentOK&&u.pathname.startsWith('/api/catalog')?409:200});};
 try{let r=await backendCheck(base+'/api/service-directory','mobile');assert.equal(r.ok,true);assert.equal(r.checks.length,6);assert.deepEqual(r.serviceDirectory,directory);assert.equal(r.checks.filter(c=>c.content).length,2);assert.ok(!paths.includes('/api/theme'));contentOK=false;r=await backendCheck(base,'tv');assert.equal(r.connectionOK,true);assert.equal(r.contentOK,false);assert.equal(r.ok,false);assert.deepEqual(r.serviceDirectory,directory);tamper=true;r=await backendCheck(base,'tablet');assert.equal(r.connectionOK,false);assert.equal(r.serviceDirectory,null);}finally{global.fetch=original;}
});

test('各设备的所有探测请求携带对应平台，电视与网页不能误测手机内容',async()=>{
 const base='https://ops.example',directory=signed(base),original=global.fetch;let platform;const seen=[];
 global.fetch=async(url,options)=>{const u=new URL(url);seen.push(options.headers['X-Hetun-Platform']);let body;
 if(u.pathname==='/api/health')body={status:'ok',service:'hetun',product:'operations-center',contract:'hetun-operations-v1'};
 else if(u.pathname==='/api/service-directory')body=directory;
 else if(u.pathname==='/api/client/bootstrap')body={contract:'hetun-operations-v1',themeContract:'hetun-runtime-v1',platform,os:u.searchParams.get('os'),config:{}};
 else body={items:[]};return new Response(JSON.stringify(body));};
 try{for(const device of ['mobile','tablet','tv','desktop']){platform=device==='desktop'?'web':device;seen.length=0;const result=await backendCheck(base,device);assert.equal(result.ok,true);assert.ok(seen.length>=5);assert.ok(seen.every(value=>value===platform));}}finally{global.fetch=original;}
});

test('过大响应在读取过程中中止，取消网络流',async()=>{
 const {jsonRequest}=require('../core/services.cjs');const original=global.fetch;let chunks=0,cancelled=false;
 global.fetch=async()=>new Response(new ReadableStream({pull(controller){if(chunks++<80)controller.enqueue(new Uint8Array(65536));else controller.close();},cancel(){cancelled=true;}}));
 try{await assert.rejects(jsonRequest('https://ops.example/large'),/响应过大/);assert.equal(cancelled,true);assert.ok(chunks<55);}finally{global.fetch=original;}
});

test('所有探测并发发起，超时明确归属接口',async()=>{const original=global.fetch;let started=0,unblock;const gate=new Promise(r=>{unblock=r;});global.fetch=async()=>{started++;await gate;throw new DOMException('The operation was aborted due to timeout','TimeoutError');};try{const pending=backendCheck('https://ops.example','mobile');await new Promise(r=>setImmediate(r));assert.equal(started,6);unblock();const r=await pending;assert.equal(r.ok,false);assert.ok(r.checks.every(c=>!c.ok&&/请求超时/.test(c.detail)));assert.equal(r.serviceDirectory,null);}finally{unblock();global.fetch=original;}});
