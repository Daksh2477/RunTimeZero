/** Local-only presentation bridge. Credentials stay in this process, never in the page. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
const PORT=Number(process.env.DEMO_VIEW_PORT??4402);
const API=process.env.SIM_API_URL??'https://algacarbon.itzzsuperrr.me/api';
const RIG='http://127.0.0.1:4401';
const username=process.env.SIM_USERNAME,password=process.env.SIM_PASSWORD;
if(!username||!password)throw Error('Set SIM_USERNAME and SIM_PASSWORD for the demo operator.');
const login=await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(15000)});
if(!login.ok)throw Error(`Operator sign-in failed (${login.status})`);
const {token}=await login.json() as {token:string};
async function api(path:string){const r=await fetch(API+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json();}
const cache=new Map<string,{at:number;data:unknown}>();
async function snapshot(id:string){const previous=cache.get(id);if(previous&&Date.now()-previous.at<15000)return previous.data;
 const detail=await api('/fleet/pond/'+id);const siteId=detail.pond.siteId;
 const [finance,weather,eligible]=await Promise.allSettled([api('/finance/site/'+siteId),api('/weather/pond/'+id),api('/market/eligible/pond/'+id)]);
 const take=(r:PromiseSettledResult<unknown>)=>r.status==='fulfilled'?r.value:{error:r.reason instanceof Error?r.reason.message:'Unavailable'};
 const data={detail,finance:take(finance),weather:take(weather),eligible:take(eligible),fetchedAt:new Date().toISOString()};cache.set(id,{at:Date.now(),data});return data;}
createServer(async(req,res)=>{
 const host=req.headers.host??'';
 if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(host)){res.writeHead(403);res.end('Local access only');return;}
 const url=new URL(req.url??'/',`http://${host}`);
 const send=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 try{
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(await readFile(new URL('../apps/web/public/demo-game.html',import.meta.url)));return;}
  if(req.method==='GET'&&url.pathname==='/state'){const r=await fetch(RIG+'/state',{signal:AbortSignal.timeout(3000)});send(r.status,await r.json());return;}
  if(req.method==='GET'&&url.pathname==='/snapshot'){const id=url.searchParams.get('pond')??'';if(!/^[a-f0-9-]{36}$/.test(id))return send(400,{error:'Select a pond'});send(200,await snapshot(id));return;}
  if(req.method==='GET'&&url.pathname==='/events'){
   const abort=new AbortController();res.on('close',()=>abort.abort());
   const r=await fetch(API+'/live/stream',{headers:{Authorization:`Bearer ${token}`},signal:abort.signal});
   if(!r.ok||!r.body)return send(502,{error:'Dashboard stream unavailable'});
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);return;
  }
  if(req.method==='POST'&&['/pause','/resume','/speed','/fault','/harvest'].includes(url.pathname)){
   if(req.headers.origin!==`http://${host}`)return send(403,{error:'Use the local control page'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return send(413,{error:'Request too large'});}
   const data=JSON.parse(body||'{}');
   // Seven ponds share a public broker: higher rates silently lose readings.
   if(url.pathname==='/speed'&&(!Number.isFinite(data.x)||data.x<1||data.x>2))return send(400,{error:'Use 1 or 2 hours per second for this live broker.'});
   const r=await fetch(RIG+url.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});send(r.status,await r.json());return;
  }
  send(404,{error:'Not found'});
 }catch(e){if(!res.headersSent)send(502,{error:e instanceof Error?e.message:'Connection unavailable'});else res.end();}
}).listen(PORT,'127.0.0.1',()=>console.log(`Local farm game: http://127.0.0.1:${PORT}`));
