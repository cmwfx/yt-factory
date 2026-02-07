import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';
import { NextRequest } from 'next/server';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';
const COOKIE_NAME = 'auth-token';

export interface JwtPayload {
  userId: string;
  username: string;
  isAdmin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: { id: string; username: string; isAdmin: boolean }): string {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin } as JwtPayload,
    env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function getUserFromRequest(request: NextRequest): JwtPayload | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getAuthCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export { COOKIE_NAME };
