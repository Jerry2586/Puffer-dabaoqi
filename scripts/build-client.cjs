'use strict';
const fs=require('node:fs/promises'),path=require('node:path');const {run}=require('../core/process.cjs');
async function buildClient({output,modules,node=process.execPath,log=()=>{}}){
 const source=path.join(__dirname,'../native/client');if(!modules)throw Error('制作完整主题底包需要clientModules或compileModules依赖目录');
 await fs.access(path.join(modules,'@dcloudio/vite-plugin-uni/bin/uni.js'));
 const compiler=path.join(output,'.client-compiler'),frontend=path.join(output,'app/src/main/assets/client');await fs.mkdir(compiler,{recursive:true});
 for(const name of ['src','package.json','tsconfig.json','shims-uni.d.ts','index.html'])await fs.cp(path.join(source,name),path.join(compiler,name),{recursive:true});
 await fs.symlink(modules,path.join(compiler,'node_modules'),'junction');
 await fs.writeFile(path.join(compiler,'vite.config.ts'),"import {defineConfig} from 'vite';import uni from '@dcloudio/vite-plugin-uni';export default defineConfig({base:'/client/',plugins:[uni()]});");
 const env={UNI_INPUT_DIR:path.join(compiler,'src'),UNI_OUTPUT_DIR:frontend,UNI_PLATFORM:'h5',NODE_ENV:'production'};
 // Clear ambient editor flags; this is always the standalone client.
 for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))env[key]='';
 await run(node,[path.join(modules,'vue-tsc/bin/vue-tsc.js'),'--noEmit'],{cwd:compiler,env,timeout:180000,log});
 await run(node,[path.join(modules,'@dcloudio/vite-plugin-uni/bin/uni.js'),'build','-p','h5'],{cwd:compiler,env,timeout:180000,log});
 for(const name of await fs.readdir(frontend,{recursive:true})){if(!name.endsWith('.css'))continue;const file=path.join(frontend,name);await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^'" )\s]+\1\s*\)/gi,'none'));}
 return frontend;
}
module.exports={buildClient};
