'use strict';
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'widget','dist');
fs.mkdirSync(dist,{recursive:true});
function gzipBytes(file){return zlib.gzipSync(fs.readFileSync(file),{level:9}).byteLength;}
for(const [source,name] of [['widget/src/loader.js','beno-chat.js'],['widget/src/chat-chunk.js','beno-chat.chunk.js']]){
  const src=path.join(root,source),out=path.join(dist,name);
  const code=fs.readFileSync(src,'utf8').replace(/\r\n/g,'\n');
  fs.writeFileSync(out,code);
  fs.writeFileSync(path.join(root,name),code);
}
const loader=path.join(dist,'beno-chat.js'),chunk=path.join(dist,'beno-chat.chunk.js');
const report={loader:{bytes:fs.statSync(loader).size,gzipBytes:gzipBytes(loader)},chunk:{bytes:fs.statSync(chunk).size,gzipBytes:gzipBytes(chunk)}};
fs.writeFileSync(path.join(root,'RELEASE-SIZE-REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.loader.gzipBytes>6*1024)process.exitCode=1;
if(report.chunk.gzipBytes>90*1024)process.exitCode=1;
