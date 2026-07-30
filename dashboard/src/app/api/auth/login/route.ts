import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.DASHBOARD_PASSWORD;
  const sessionSecret = process.env.DASHBOARD_SESSION_SECRET;

  if (!configuredPassword || !sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json(
      { error: 'Dashboard authentication is not configured.' },
      { status: 503 },
    );
  }

  let candidate = '';
  try {
    const body = await request.json() as { password?: unknown };
    candidate = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!passwordMatches(candidate, configuredPassword)) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(sessionSecret),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  return response;
}
