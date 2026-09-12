export async function clientFetch(path:string, init:RequestInit={}){
 const response=await fetch(`/api/backend${path}`,{...init,cache:'no-store',credentials:'same-origin',signal:init.signal??AbortSignal.timeout(35000)});
 if(response.status===401 && !path.startsWith('/auth/'))window.dispatchEvent(new Event('rtz-auth-expired'));
 return response;
}
export async function clientJson<T>(path:string,init:RequestInit={}):Promise<T>{
 const response=await clientFetch(path,{...init,headers:{'Content-Type':'application/json',...init.headers}});
 const data=await response.json().catch(()=>({error:'The service returned an unreadable response.'}));
 if(!response.ok)throw new Error(data.error??'The request could not be completed.');
 return data as T;
}
