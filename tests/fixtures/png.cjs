'use strict';
const {deflateSync}=require('node:zlib'),{crc32}=require('../../core/zip.cjs');
function png(color=120,width=2,height=width){const chunk=(type,data)=>{const kind=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);kind.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([kind,data])),out.length-4);return out;};const head=Buffer.alloc(13);head.writeUInt32BE(width);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;const rows=Buffer.alloc((width*4+1)*height,color);for(let y=0;y<height;y++)rows[y*(width*4+1)]=0;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
module.exports={png};
