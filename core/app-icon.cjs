'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {inflateSync}=require('node:zlib');
const {crc32}=require('./zip.cjs');
const {inside}=require('./domain.cjs');
const ICON_PATH='res/drawable/hetun_app_icon.png',MAX_BYTES=5*1024*1024;
function validatePng(bytes){
 const invalid=()=>{throw Error('请选择有效 PNG：正方形、8 位非交错图片，尺寸不超过 2048×2048，文件不超过 5MB。');};
 if(!Buffer.isBuffer(bytes)||bytes.length<33||bytes.length>MAX_BYTES||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))invalid();
 let pos=8,width,height,channels,ended=false,seenData=false,palette=false,dataEnded=false;const data=[];
 while(pos<bytes.length){
  if(pos+12>bytes.length)invalid();const size=bytes.readUInt32BE(pos),end=pos+12+size;if(end>bytes.length)invalid();
  const type=bytes.toString('latin1',pos+4,pos+8),chunk=bytes.subarray(pos+8,pos+8+size);if(!/^[a-zA-Z]{4}$/.test(type)||type[2]!==type[2].toUpperCase())invalid();
  if(crc32(bytes.subarray(pos+4,pos+8+size))!==bytes.readUInt32BE(pos+8+size))invalid();
  if(pos===8&&type!=='IHDR')invalid();
  if(type==='IHDR'){
   if(pos!==8||size!==13)invalid();width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);channels={0:1,2:3,3:1,4:2,6:4}[chunk[9]];
   if(!width||width!==height||width>2048||chunk[8]!==8||!channels||chunk[10]||chunk[11]||chunk[12])invalid();
  }else if(type==='PLTE'){if(seenData||palette||!size||size>768||size%3)invalid();palette=true;}
  else if(type==='IDAT'){if(dataEnded)invalid();seenData=true;data.push(chunk);}
  else if(type==='IEND'){if(size||!seenData||end!==bytes.length)invalid();ended=true;break;}
  else {if(seenData)dataEnded=true;if(!/^[a-zA-Z]{4}$/.test(type)||type[0]===type[0].toUpperCase())invalid();}
  pos=end;
 }
 if(!ended||(bytes[25]===3&&!palette))invalid();
 const stride=width*channels+1,expected=stride*height;let raw;
 try{raw=inflateSync(Buffer.concat(data),{maxOutputLength:expected});}catch{invalid();}
 if(raw.length!==expected)invalid();for(let row=0;row<height;row++)if(raw[row*stride]>4)invalid();
 return bytes;
}
function iconPath(descriptor){if(descriptor.appIcon===undefined)return '';if(descriptor.appIcon!==ICON_PATH)throw Error('基础包图标资源声明无效');return ICON_PATH;}
async function readIcon(root,file){if(typeof file!=='string'||!inside(path.join(root,'icons'),file))throw Error('应用图标不在本机图标目录，请重新上传');const actual=await fs.realpath(file),directory=await fs.realpath(path.join(root,'icons'));if(!inside(directory,actual))throw Error('应用图标不在本机图标目录，请重新上传');const handle=await fs.open(actual,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('图标文件无效或超过 5MB');return validatePng(await handle.readFile());}finally{await handle.close();}}
async function importIcon(root,input,pick){let bytes;if(Object.hasOwn(input,'content')){if(typeof input.content!=='string'||input.content.length>Math.ceil(MAX_BYTES/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content))throw Error('图标上传内容无效');bytes=Buffer.from(input.content,'base64');}else{const file=await pick();if(!file)return null;const handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('图标文件超过 5MB');bytes=await handle.readFile();}finally{await handle.close();}}validatePng(bytes);const file=path.join(root,'icons',crypto.randomUUID()+'.png');await fs.writeFile(file,bytes,{flag:'wx'});return {file,data:'data:image/png;base64,'+bytes.toString('base64')};}
module.exports={ICON_PATH,MAX_BYTES,validatePng,iconPath,readIcon,importIcon};
