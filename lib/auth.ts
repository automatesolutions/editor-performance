/**
 * Shared-password session (v1).
 *
 * One password for everyone, carried in a signed HTTP-only cookie. No user
 * records and no roles: that is what the brief asked for, and the middleware
 * boundary means swapping in real SSO later touches only this file,
 * middleware.ts, and the login route.
 *
 * Uses `jose` so the same code runs on the Edge runtime, where node:crypto is
 * unavailable.
 */

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'epr_session';
const SESSION_DAYS = 30;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret: string): Promise<string> {
  return new SignJWT({ v: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey(secret));
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison.
 *
 * A plain `===` on the password leaks its length and prefix through timing.
 * Compares over a fixed number of iterations so the work does not depend on
 * where the first difference falls.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
