import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'galaktikuzay_dashboard_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function passwordMatches(candidate: string, configuredPassword: string): boolean {
  return safeEqual(candidate, configuredPassword);
}

export function createSessionToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  })).toString('base64url');

  return `${payload}.${signature(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string | undefined): boolean {
  if (!token || !secret || secret.length < 32) {
    return false;
  }

  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) {
    return false;
  }

  if (!safeEqual(suppliedSignature, signature(payload, secret))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'admin'
      && typeof parsed.exp === 'number'
      && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
