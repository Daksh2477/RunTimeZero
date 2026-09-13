import { NextRequest, NextResponse } from 'next/server';
import { API_ORIGIN, SESSION_COOKIE, serverApiFetch } from '@/lib/server-api';
const ROOTS=new Set(['auth','fleet','land','ponds','batches','market','verify','summary','simulate','weather','research','invest','produce','harvests','health','live','finance']);
async function handle(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params;
 if(!ROOTS.has(path[0]??'') || path.some(p=>!p || p==='.' || p==='..' || p.includes('/') || p.includes('\\')))return NextResponse.json({error:'Unknown API route.'},{status:404});
 const write=request.method!=='GET';
 if(write && request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Send this request from the AlgaCarbon app.'},{status:403});
 const clear=()=>{const r=NextResponse.json({ok:true});r.cookies.set(SESSION_COOKIE,'',{httpOnly:true,path:'/',maxAge:0,sameSite:'lax'});return r;};
 if(path.join('/')==='auth/logout' && write)return clear();
 const authEntry=path[0]==='auth' && ['login','register'].includes(path[1]??'');
 try{
  const body=write?await request.text():undefined;
  const route=`/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const stream=path.join('/')==='live/stream' && !write;
  const init={method:request.method,headers:{'Content-Type':'application/json'},body,signal:stream?request.signal:AbortSignal.timeout(30000)};
  const upstream=authEntry?await fetch(`${API_ORIGIN}${route}`,{...init,cache:'no-store'}):await serverApiFetch(route,init);
  const type=upstream.headers.get('content-type')??'';
  if(stream && upstream.ok && type.startsWith('text/event-stream'))return new NextResponse(upstream.body,{status:upstream.status,headers:{'Content-Type':type,'Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
  if(type.startsWith('image/'))return new NextResponse(await upstream.arrayBuffer(),{status:upstream.status,headers:{'Content-Type':type,'Cache-Control':'private, max-age=86400'}});
  const data=await upstream.json().catch(()=>({error:'The service returned an unreadable response.'}));
  if(authEntry && upstream.ok){
   const {token,...safe}=data;
   if(typeof token!=='string')return NextResponse.json({error:'Sign-in response was incomplete.'},{status:502});
   const response=NextResponse.json(safe,{status:upstream.status});
   response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:7*86400});return response;
  }
  const response=NextResponse.json(data,{status:upstream.status,headers:{'Cache-Control':'no-store'}});
  if(upstream.status===401 && !authEntry)response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,path:'/',maxAge:0,sameSite:'lax'});
  return response;
 }catch{return NextResponse.json({error:write?'The result could not be confirmed. Check the latest records before submitting again.':'The service is temporarily unavailable.'},{status:502});}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
