'use strict';
async function previewRequest(name,input={}){
 if(!previewMethods.includes(name))throw Error('请在桌面打包器中使用此功能。');
 const response=await fetch('/api/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Hetun-Client':'packer-preview'},body:JSON.stringify(input)}),data=await response.json();
 if(!data.ok)throw Error(data.error||'本机请求失败');return data.value;
}
async function uploadThemeFile(file,target){
 if(!file||!/\.(zip|json)$/i.test(file.name))throw Error('请选择 .zip 或 .json 主题文件');
 if(file.size>12*1024*1024)throw Error('主题包最大 12MB。');
 const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('无法读取主题文件'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
 return previewRequest('themeImport',{...target,fileName:file.name,content});
}
window.packer=new Proxy({
 onEvent(callback){const events=new EventSource('/events');events.onmessage=e=>callback(JSON.parse(e.data));return()=>events.close();},
 themeImportFile:uploadThemeFile,
 icon(){return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.png,image/png';input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve(null);};input.onchange=()=>{const file=input.files[0];input.remove();if(!file)return resolve(null);if(file.size>5*1024*1024)return reject(Error('图标最大 5MB'));const reader=new FileReader();reader.onerror=()=>reject(Error('无法读取图标'));reader.onload=()=>previewRequest('icon',{content:String(reader.result).split(',')[1]}).then(resolve,reject);reader.readAsDataURL(file);};input.click();});},
 themeImport(target){return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.zip,.json';input.hidden=true;document.body.append(input);input.oncancel=()=>{input.remove();resolve(null);};input.onchange=()=>{const file=input.files[0];input.remove();if(!file){resolve(null);return;}uploadThemeFile(file,target).then(resolve,reject);};input.click();});}
},{get(target,name){if(name in target)return target[name];return input=>previewRequest(name,input);}});
