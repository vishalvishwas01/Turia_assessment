import { NextRequest, NextResponse } from "next/server";
export async function middleware(request: NextRequest) {
  const path=request.nextUrl.pathname;
  if (["/login","/signup","/invite"].includes(path)) return NextResponse.next();
  const token=request.cookies.get("taskdesk_session")?.value;
  let valid=false;
  if(token){
    try{
      const organization=request.cookies.get("taskdesk_organization")?.value;
      let response=await fetch(`${process.env.API_URL??"http://localhost:4000"}/me${organization?`?organizationId=${encodeURIComponent(organization)}`:""}`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});
      if(response.status===403&&organization)response=await fetch(`${process.env.API_URL??"http://localhost:4000"}/me`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});
      valid=response.ok||response.status===400;
    }catch{}
  }
  if(!valid){
    const url=new URL("/login",request.url);
    url.searchParams.set("next",`${path}${request.nextUrl.search}`);
    if(token)url.searchParams.set("session","ended");
    const response=NextResponse.redirect(url);
    response.cookies.set("taskdesk_session","",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:0});
    return response;
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!api|_next/static|_next/image|favicon.ico).*)"]};
