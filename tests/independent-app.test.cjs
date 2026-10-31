'use strict';
const {seedLegacyTheme}=require('./fixtures/legacy-theme.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{Store}=require('../core/store.cjs');
test('打包器独立启动，隐藏旧同步主题和绑定，仅手动重导入后可用',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hetun-independent-packer-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const seed=await new Store(root).init(),app=await seed.create('保留应用');
 const manifest={format:'hetun-skeleton',version:2,renderer:'hetun-v2',platform:'mobile',id:'retained-theme',name:'已有主题',theme:{schemaVersion:2,brand:{name:'已有主题'},sections:[],navigation:[]}};
 const retained=await seedLegacyTheme(seed,Buffer.from(JSON.stringify(manifest)),'.json','local-catalog');app.profiles.mobile.themeId=retained.key;await seed.commit();
 const shared=path.join(root,'shared-link');await fs.mkdir(shared);await fs.writeFile(path.join(shared,'catalog.json'),'queued external catalog');
 let incoming=path.join(root,'manual-theme.json');await fs.writeFile(incoming,JSON.stringify({...manifest,name:'手动主题'}));
 const callbacks=new Map(),ipc=new Map(),errors=[],required=[];let boot,window;
 class Window{constructor(){window=this;this.webContents={mainFrame:{},send(){},setWindowOpenHandler(){},on(){}};}hide(){}show(){}loadFile(){return Promise.resolve();}on(){}isDestroyed(){return false;}}
 const electron={app:{isPackaged:false,setPath(){},getPath:()=>root,getVersion:()=> '0.5.0',requestSingleInstanceLock:()=>true,quit(){},on:(name,fn)=>callbacks.set(name,fn),whenReady:()=>({then(fn){boot=fn();return boot;}})},BrowserWindow:Window,ipcMain:{handle:(name,fn)=>ipc.set(name,fn)},dialog:{showErrorBox:(...args)=>errors.push(args),showOpenDialog:async()=>({canceled:false,filePaths:[incoming]})},shell:{},safeStorage:{},Menu:{setApplicationMenu(){}},nativeTheme:{}};
 const nativeRequire=createRequire(path.resolve(__dirname,'../main.cjs'));
 const context=vm.createContext({require(name){required.push(name);if(name==='electron')return electron;if(name.includes('theme-receiver')||name.includes('local-link'))throw Error('启动触发了跨应用连接');return nativeRequire(name);},__dirname:path.resolve(__dirname,'..'),process:{env:{...process.env,HETUN_PACKER_TEST_ROOT:root,HETUN_LOCAL_LINK_ROOT:shared,HETUN_PACKER_PREVIEW:'0'},platform:process.platform},Buffer,structuredClone,console,setTimeout,clearTimeout});
 vm.runInContext(await fs.readFile(path.resolve(__dirname,'../main.cjs'),'utf8'),context);await boot;assert.deepEqual(errors,[]);
 for(const method of ['cloudBuild','cloudDownload','licenseStatus','authorizationOpen','updateCheck','uninstall','source','nodeTest'])assert.equal(ipc.has('packer:'+method),false);
 assert.ok(!required.some(name=>/cloud|updates|authorization|native-project/.test(name)));
 let exposed;vm.runInNewContext(await fs.readFile(path.resolve(__dirname,'../preload.cjs'),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld(_name,value){exposed=value;}},ipcRenderer:{invoke:async(channel,input)=>ipc.get(channel)({sender:window.webContents,senderFrame:window.webContents.mainFrame},input)},webUtils:{}})});
 assert.deepEqual(Object.keys(exposed).filter(name=>!name.endsWith('File')&&name!=='onEvent').sort(),[...ipc.keys()].map(name=>name.slice(7)).sort());

 assert.equal(ipc.has('packer:localReceive'),false);assert.equal(ipc.has('packer:localLink'),false);assert.equal(ipc.has('packer:themeSync'),false);
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 let result=await ipc.get('packer:state')(event,{});assert.equal(result.ok,true);assert.equal(result.value.selectedApp,'');assert.equal(result.value.apps.length,1);assert.equal(Object.hasOwn(result.value,'localLink'),false);assert.equal(Object.hasOwn(result.value,'themes'),false);assert.equal(result.value.apps[0].profiles.mobile.uploadedTheme,null);assert.equal(result.value.apps[0].profiles.mobile.themeId,'');
 const diskBefore=JSON.parse(await fs.readFile(seed.file,'utf8'));assert.equal(diskBefore.themes[0].key,retained.key);assert.equal(diskBefore.apps[0].profiles.mobile.themeId,retained.key);assert.ok((await fs.stat(path.join(root,'themes',retained.key,'theme.zip'))).size>0);
 const forged=structuredClone(result.value.apps[0]);forged.profiles.mobile.themeId=retained.key;result=await ipc.get('packer:save')(event,forged);assert.equal(result.ok,true);assert.equal(result.value.apps[0].profiles.mobile.themeId,'');
 result=await ipc.get('packer:themeImport')(event,{appId:app.id,device:'mobile',expectedKey:''});assert.equal(result.ok,true);assert.equal(Object.hasOwn(result.value,'themes'),false);const imported=result.value.apps[0].profiles.mobile.uploadedTheme;assert.equal(imported.name,'手动主题');assert.equal(imported.fileName,'manual-theme.json');assert.notEqual(imported.key,retained.key);assert.equal(result.value.apps[0].profiles.mobile.themeId,imported.key);
 const selected=structuredClone(result.value.apps[0]);selected.profiles.mobile.themeId=retained.key;result=await ipc.get('packer:save')(event,selected);assert.equal(result.ok,true);assert.equal(result.value.apps[0].profiles.mobile.themeId,imported.key);
 const diskAfter=JSON.parse(await fs.readFile(seed.file,'utf8'));assert.equal(diskAfter.themes.length,2);assert.equal(diskAfter.themes[0].origin,'local-catalog');assert.ok((await fs.stat(path.join(root,'themes',retained.key,'theme.zip'))).size>0);
 assert.deepEqual(await fs.readdir(shared),['catalog.json']);assert.equal(await fs.readFile(path.join(shared,'catalog.json'),'utf8'),'queued external catalog');
 const invalid=path.join(root,'invalid.png');await fs.writeFile(invalid,'not-a-png');incoming=invalid;await assert.rejects(exposed.icon(),/有效 PNG/);
 const icon=path.join(root,'valid.png'),png=await fs.readFile(path.join(__dirname,'../assets/icon.png'));await fs.writeFile(icon,png);incoming=icon;const uploaded=await exposed.icon();assert.deepEqual(await fs.readFile(uploaded.file),png);assert.match(uploaded.data,/^data:image\/png;base64,/);assert.equal(path.dirname(uploaded.file),path.join(root,'icons'));
 await assert.rejects(ipc.get('packer:icon')({sender:{},senderFrame:{}},{}),/调用来源无效/);
 callbacks.get('before-quit')();
});
