'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function copyTree(from,to){await fs.mkdir(to,{recursive:true});for(const e of await fs.readdir(from,{withFileTypes:true})){if(['node_modules','.git','.gradle','.idea','local.properties','build','bin','obj','dist','unpackage','.DS_Store'].includes(e.name))continue;if(e.isSymbolicLink())throw Error('原生源码不能包含符号链接。');const src=path.join(from,e.name),dst=path.join(to,e.name);if(e.isDirectory())await copyTree(src,dst);else if(e.isFile())await fs.copyFile(src,dst);}}
module.exports={copyTree};
