import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

type RouteParams = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(request: NextRequest, context: RouteParams) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(session, process.env.DASHBOARD_SESSION_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_API_URL;
  const apiToken = process.env.DASHBOARD_API_TOKEN;
  if (!backendUrl || !apiToken) {
    return NextResponse.json(
      { error: 'Backend proxy is not configured.' },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join('/')}`, backendUrl);
  target.search = request.nextUrl.search;

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${apiToken}`,
  });
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const method = request.method;
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  try {
    const backendResponse = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
    const responseBody = await backendResponse.arrayBuffer();
    return new NextResponse(responseBody, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Backend is unavailable.' }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
