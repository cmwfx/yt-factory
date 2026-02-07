import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserCount, getUserByUsername } from '@/lib/db';
import { hashPassword, generateToken, getUserFromRequest, getAuthCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if any users exist
    const userCount = await getUserCount();

    if (userCount > 0) {
      // Require admin JWT to create additional users
      const currentUser = getUserFromRequest(request);
      if (!currentUser?.isAdmin) {
        return NextResponse.json({ error: 'Admin authentication required' }, { status: 403 });
      }
    }

    // Check for duplicate username
    const existing = await getUserByUsername(username);
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(username, passwordHash, true); // All users are admins

    const token = generateToken(user);
    const cookieOptions = getAuthCookieOptions();

    const response = NextResponse.json({
      user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    });

    response.cookies.set(cookieOptions.name, token, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
