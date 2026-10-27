const test=require('node:test'),assert=require('node:assert/strict'),{startPreview}=require('../core/preview.cjs'),path=require('node:path');
test('浏览器镜像只开放回环、受限方法及同源会话',async()=>{let calls=0;const preview=await startPreview({root:path.join(__dirname,'..'),invoke:async()=>{calls++;return {offline:true};}});try{const page=await fetch(preview.url),html=await page.text(),cookie=page.headers.get('set-cookie').split(';')[0];assert.match(html,/preview-bridge.js/);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);assert.equal((await fetch(preview.url+'/api/state',{method:'POST'})).status,401);assert.equal((await fetch(preview.url+'/api/state',{method:'POST',headers:{cookie,Origin:'https://evil.example','Content-Type':'application/json','X-Hetun-Client':'packer-preview'},body:'{}'})).status,403);const out=await fetch(preview.url+'/api/state',{method:'POST',headers:{cookie,Origin:preview.url,'Content-Type':'application/json','X-Hetun-Client':'packer-preview'},body:'{}'});assert.equal((await out.json()).value.offline,true);assert.equal(calls,1);assert.equal((await fetch(preview.url+'/api/build',{method:'POST',headers:{cookie}})).status,404);assert.equal((await fetch(preview.url+'/main.cjs')).status,404);}finally{preview.stop();}});

test('预览上传只接收当前应用文件内容，不允许服务器本地路径与无来源请求',async()=>{
 const calls=[],preview=await startPreview({root:path.join(__dirname,'..'),invoke:async(name,input)=>{calls.push({name,input});return {uploaded:true};}});
 try{const page=await fetch(preview.url),cookie=page.headers.get('set-cookie').split(';')[0],headers={cookie,Origin:preview.url,'Content-Type':'application/json','X-Hetun-Client':'packer-preview'},target={appId:'test-app',device:'mobile',expectedKey:'',fileName:'主题.json',content:'e30='};
 const post=(input,extra={})=>fetch(preview.url+'/api/themeImport',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)});
 assert.equal((await post({...target,filePath:'C:/secret.json'})).status,400);assert.equal((await post({appId:'test-app',device:'mobile'})).status,400);
 assert.equal((await post(target,{Origin:'https://elsewhere.example'})).status,403);assert.equal(calls.length,0);
 assert.equal((await (await post(target)).json()).value.uploaded,true);assert.deepEqual(calls[0],{name:'themeImport',input:target});
 assert.equal((await (await fetch(preview.url+'/api/themeRemove',{method:'POST',headers,body:JSON.stringify({appId:'test-app',device:'mobile',key:'x'})})).json()).ok,true);
 const bridge=await (await fetch(preview.url+'/preview-bridge.js')).text();assert.match(bridge,/themeImportFile:uploadThemeFile/);assert.match(bridge,/input.accept='.zip,.json'/);
 }finally{preview.stop();}
});
