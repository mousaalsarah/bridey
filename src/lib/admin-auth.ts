import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "bridey_admin";

function secret() {
  return new TextEncoder().encode(`${process.env.AUTH_SECRET || "bridey-dev-secret"}-admin`);
}

export async function createAdminSession(adminId: string) {
  const token = await new SignJWT({ sub: adminId, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroyAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentAdmin() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "admin" || typeof payload.sub !== "string") return null;
    return db.admin.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
}
