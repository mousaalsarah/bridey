import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { adminSecretBytes, authSecretBytes } from "@/lib/secrets";

const PROTECTED = ["/dashboard", "/onboarding"];
const ADMIN = ["/admin"];

function secret() {
  return authSecretBytes();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPath = ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isAdminPath && pathname !== "/admin/login") {
    const admin = req.cookies.get("bridey_admin")?.value;
    if (!admin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    try {
      await jwtVerify(admin, adminSecretBytes());
      return NextResponse.next();
    } catch {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get("bridey_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/onboarding", "/admin", "/admin/:path*"],
};
