'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const {Authorization,endpoint}=require('./authorization.cjs');
async function createDesktopAuthorization({app,BrowserWindow,ipcMain,dialog,safeStorage,root,product,parent,onInvalid}){
 let trust=null;const trustPath=app.isPackaged?path.join(app.getAppPath(),'authorization-trust.json'):process.env.HETUN_AUTH_TRUST_FILE||path.join(app.getAppPath(),'authorization-trust.json');
 try{trust=JSON.parse(await fs.readFile(trustPath,'utf8'));if(app.isPackaged&&trust.development)throw Error('正式安装包不能使用开发授权入口');endpoint(trust.url,trust.development===true&&!app.isPackaged);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!safeStorage.isEncryptionAvailable())throw Error('系统安全存储不可用，无法保存本机授权');
 let authWindow=null,opened=false,previous=false;
 const auth=await new Authorization({root:path.join(root,'authorization'),product,version:app.getVersion(),trust,encrypt:s=>safeStorage.encryptString(s),decrypt:b=>safeStorage.decryptString(b),machineFile:path.join(app.getPath('appData'),'HetunProducts','machine-id'),onChange:status=>{if(previous&&!status.valid)Promise.resolve(onInvalid?.(status)).catch(()=>{});previous=status.valid;authWindow?.webContents.send('authorization:status',status);}}).init();
 const page=path.join(__dirname,'authorization-ui','index.html');
 const methods={status:()=>auth.status(),activate:async v=>auth.activate(String(v.key||''),String(v.domain||'')),check:()=>auth.check(),export:async v=>{const bytes=await auth.exportMigration(v.password);const r=await dialog.showSaveDialog(authWindow,{title:'导出加密离线迁移包',defaultPath:product+'-migration.hetun',filters:[{name:'河豚加密迁移包',extensions:['hetun']}]});if(r.canceled)return {canceled:true};await fs.writeFile(r.filePath,bytes,{mode:0o600});return {saved:true};},import:async v=>{const r=await dialog.showOpenDialog(authWindow,{properties:['openFile'],filters:[{name:'河豚加密迁移包',extensions:['hetun']}]});if(r.canceled)return {canceled:true};const stat=await fs.stat(r.filePaths[0]);if(stat.size>48*1024*1024)throw Error('迁移包过大');return (await auth.importMigration(await fs.readFile(r.filePaths[0]),v.password)).status;},continue:()=>{auth.assert();authWindow?.close();return true;}};
 const channel='authorization:'+product;
 ipcMain.handle(channel,async(event,{action,input={}}={})=>{if(!authWindow||event.sender!==authWindow.webContents||event.senderFrame!==authWindow.webContents.mainFrame)throw Error('授权通信来源无效');try{if(!Object.hasOwn(methods,action))throw Error('授权操作无效');return {ok:true,value:await methods[action](input)};}catch(e){return {ok:false,error:e.message};}});
 async function show(){if(authWindow){authWindow.show();authWindow.focus();return;}opened=true;authWindow=new BrowserWindow({width:640,height:680,resizable:false,title:'河豚产品授权',parent:parent?.(),modal:!!parent?.(),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'authorization-ui','preload.cjs'),additionalArguments:['--hetun-auth-product='+product],contextIsolation:true,nodeIntegration:false,sandbox:true}});authWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));authWindow.webContents.on('will-navigate',e=>e.preventDefault());await authWindow.loadFile(page);await new Promise(resolve=>authWindow.once('closed',()=>{authWindow=null;resolve();}));}
 async function ready(){if(!auth.status().valid)await show();auth.assert();previous=true;auth.start();return auth;}
 return {auth,show,ready,stop:()=>auth.stop()};
}
module.exports={createDesktopAuthorization};
