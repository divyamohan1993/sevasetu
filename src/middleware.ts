import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/bookings", "/settings", "/provider"];

// Better-Auth prefixes the session cookie with `__Secure-` over HTTPS in
// production, and just uses the bare prefix during HTTP/local development.
// We accept both, plus the dash-form some older versions used.
const SESSION_COOKIE_NAMES = [
  "__Secure-sevasetu.session_token",
  "sevasetu.session_token",
  "sevasetu.session-token",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isProtected) return NextResponse.next();

  const hasSession = SESSION_COOKIE_NAMES.some((n) => req.cookies.get(n)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/bookings/:path*", "/settings/:path*", "/provider/:path*"],
};
