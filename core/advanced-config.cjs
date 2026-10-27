'use strict';
// Shared by form persistence, runtime export and the binary-manifest editor.
function advancedConfig(value={}, requirePair=true){
 const out={...value,scheme:String(value.scheme||'').trim().toLowerCase(),host:String(value.host||'').trim().toLowerCase(),channel:String(value.channel||'default').trim()||'default'};
 if(out.scheme&&(!/^[a-z][a-z0-9+.-]{0,62}$/.test(out.scheme)||['http','https','file','content','intent','javascript','data','about'].includes(out.scheme)))throw Error('网页唤起 Scheme 请使用应用专用名称，例如 hetun。');
 if(out.host&&(out.host.length>253||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(out.host)))throw Error('网页唤起 Host 请填写主机名，例如 open，不含协议、端口或路径。');
 if(requirePair&&!!out.scheme!==!!out.host)throw Error('网页唤起需同时填写 Scheme 和 Host，或同时留空。');
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(out.channel))throw Error('渠道标识仅支持 1–64 位字母、数字、点、下划线和短横线。');
 return out;
}
module.exports={advancedConfig};
