import { NextRequest, NextResponse } from "next/server";
const api=process.env.API_URL??"http://localhost:4000";
async function forward(request:NextRequest,context:{params:Promise<{path:string[]}>}) {
  const {path}=await context.params, endpoint=`${api}/${path.join("/")}${request.nextUrl.search}`;
  const token=request.cookies.get("taskdesk_session")?.value;
  const headers=new Headers(); if(token) headers.set("authorization",`Bearer ${token}`);
  if(request.headers.get("content-type")) headers.set("content-type",request.headers.get("content-type")!);
  const body=["GET","HEAD"].includes(request.method)?undefined:await request.text();
  const upstream=await fetch(endpoint,{method:request.method,headers,body,cache:"no-store"});
  if(path.join("/")==="auth/login"&&upstream.ok){const data=await upstream.json(),response=NextResponse.json(data,{status:upstream.status});response.cookies.set("taskdesk_session",data.accessToken,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});return response;}
  if(path.join("/")==="auth/logout"){const response=new NextResponse(null,{status:upstream.status});response.cookies.set("taskdesk_session","",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});return response;}
  const text=await upstream.text();return new NextResponse(text,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")??"application/json"}});
}
export {forward as GET,forward as POST,forward as PATCH,forward as DELETE};
