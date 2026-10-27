'use strict';
// Development-only browser mirror of the running desktop process. No separate store.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function startPreview({root,invoke,port=0}){
 const token=crypto.randomBytes(32).toString('hex'),clients=new Set();let origin;
 const methods=['state','create','save','select','duplicate','remove','environment','inspect','settings','checkBackend','cancel','themeImport','themeRemove'];
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.host!==new URL(origin).host){res.writeHead(403);return res.end();}
  const url=new URL(req.url,origin),valid=(req.headers.cookie||'').split(';').some(v=>v.trim()==='hetun_packer_preview='+token);
  if(url.pathname.startsWith('/api/')||url.pathname==='/events'){
   if(!valid){res.writeHead(401);return res.end();}
   if(url.pathname==='/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
   const name=url.pathname.slice(5);if(!methods.includes(name)){res.writeHead(404);return res.end(JSON.stringify({error:'请在桌面打包器中使用此功能。'}));}
   if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-hetun-client']!=='packer-preview'||!String(req.headers['content-type']||'').startsWith('application/json')){res.writeHead(403);return res.end();}
   const chunks=[];let size=0;const limit=name==='themeImport'?17*1024*1024:200000;for await(const b of req){size+=b.length;if(size>limit)throw Error('请求过大');chunks.push(b);}const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(name==='themeImport'&&(!input||typeof input.content!=='string'||typeof input.fileName!=='string'||Object.keys(input).some(k=>!['appId','device','expectedKey','fileName','content'].includes(k))))throw Error('预览页面只接受上传的主题文件');const value=await invoke(name,input);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,value}));
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
  if(url.pathname==='/preview-bridge.js'){
   const source='const previewMethods='+JSON.stringify(methods)+';\n'+await fs.readFile(path.join(root,'renderer','preview-bridge.js'),'utf8');
   res.writeHead(200,{...headers,'Content-Type':'text/javascript; charset=utf-8'});return res.end(source);
  }
  const files={'/':'renderer/index.html','/app.js':'renderer/app.js','/style.css':'renderer/style.css','/assets/mark.svg':'assets/mark.svg'};const file=files[url.pathname];if(!file){res.writeHead(404);return res.end();}
  let bytes=await fs.readFile(path.join(root,file));if(url.pathname==='/'){let html=bytes.toString().replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');html=html.replace('<script src="app.js">','<script src="preview-bridge.js"></script><script src="app.js">');bytes=Buffer.from(html);headers['Set-Cookie']='hetun_packer_preview='+token+'; HttpOnly; SameSite=Strict; Path=/';}
  res.writeHead(200,{...headers,'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml'});res.end(bytes);
 }catch(e){if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:e.message}));}});
 await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});origin='http://127.0.0.1:'+server.address().port;
 return {url:origin,emit(event){for(const res of clients)res.write('data: '+JSON.stringify(event)+'\n\n');},stop(){for(const res of clients)res.end();server.closeAllConnections();server.close();}};
}
module.exports={startPreview};
