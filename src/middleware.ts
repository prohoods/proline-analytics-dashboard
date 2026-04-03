import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const auth = request.cookies.get("auth");
  const { pathname } = request.nextUrl;

  // Allow login page, auth routes, and debug endpoint through
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/debug")) {
    return NextResponse.next();
  }

  // Require auth for everything else
  if (!auth || auth.value !== "true") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
