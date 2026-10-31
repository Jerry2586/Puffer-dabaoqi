'use strict';
// Seed historical records only for migration/isolation tests; not a production import API.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {parseTheme}=require('../../core/themes.cjs'),{makeZip}=require('../../core/zip.cjs');
async function seedLegacyTheme(store,buffer,extension,origin='import'){
 const {manifest,files}=parseTheme(buffer,extension),key=crypto.randomUUID();
 const dir=path.join(store.root,'themes',key);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'theme.zip'),makeZip(files),{flag:'wx'});
 const theme={key,id:manifest.id,name:manifest.name,platform:manifest.platform,renderer:manifest.renderer,digest:crypto.createHash('sha256').update(buffer).digest('hex'),origin,appId:'',fileName:'',installedAt:new Date().toISOString()};
 store.state.themes.push(theme);await store.commit();return theme;
}
module.exports={seedLegacyTheme};
