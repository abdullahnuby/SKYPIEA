'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Tiny .env readers for local development; real secrets must remain outside Git.
// `.env.local` is written by `neon deploy` and wins over a committed-less `.env`.
for (const name of ['.env.local', '.env']) {
  const envFile = path.join(root, name);
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
// With a provisioned Neon database the app talks to Postgres; without one it
// stays in the in-memory/file demo mode used by the smoke tests.
process.env.BENO_LOCAL_DEMO = process.env.BENO_LOCAL_DEMO ?? (process.env.DATABASE_URL ? '0' : '1');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
function send(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/api/tool'||pathname==='/api/lead'){require(path.join(root,pathname==='/api/lead'?'api/lead.js':'api/tool.js'))(req,res);return;}if(pathname.startsWith('/api/admin/')){const route=path.resolve(root,`.${pathname}.js`);if(!route.startsWith(path.join(root,'api','admin'))||!fs.existsSync(route)){send(res,404,'Not found');return;}require(route)(req,res);return;}if(pathname==='/admin'||pathname==='/admin/'){const admin=path.join(root,'admin.html');send(res,200,fs.readFileSync(admin),types['.html']);return;}if(pathname.startsWith('/api/_data/')){send(res,404,'Not found');return;}let file=pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+pathname);if(!file.startsWith(root)){send(res,403,'Forbidden');return;}if(!fs.existsSync(file)||!fs.statSync(file).isFile()){send(res,404,'Not found');return;}send(res,200,fs.readFileSync(file),types[path.extname(file)]||'application/octet-stream');});server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Beno local demo: http://127.0.0.1:${server.address().port} (${process.env.BENO_LOCAL_DEMO==='1'?'in-memory leads/file storage':'Neon Postgres persistence'})`));
