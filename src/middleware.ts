import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((request) => {
  const cfoAuth = request.cookies.get("cfo-auth");
  const { pathname } = request.nextUrl;
  const isSignedIn = !!request.auth;

  // Allow public routes through (including portal at /)
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/cfo-login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/finance") ||
    pathname.startsWith("/api/shopify-shl") ||
    pathname.startsWith("/api/shipping") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/shopify/debug-refunds") ||
    pathname.startsWith("/api/google-ads/debug") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/conversions") ||
    pathname.startsWith("/api/ai-reporting") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  // Finance Hub: only requires CFO password (handled inside the layout)
  if (pathname.startsWith("/finance")) {
    return NextResponse.next();
  }

  // Legacy CFO dashboard routes
  if (pathname.startsWith("/dashboard/cfo") || pathname.startsWith("/api/cfo")) {
    if (!isSignedIn) {
      return NextResponse.redirect(new URL(`/login?next=${pathname}`, request.url));
    }
    if (!cfoAuth || cfoAuth.value !== "true") {
      return NextResponse.redirect(new URL("/cfo-login", request.url));
    }
    return NextResponse.next();
  }

  // All other dashboard routes require Google sign-in only
  if (!isSignedIn) {
    return NextResponse.redirect(new URL(`/login?next=${pathname}`, request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
